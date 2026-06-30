const jwt = require("jsonwebtoken");
const xlsx = require("xlsx");
const { Types } = require("mongoose");
const Institute = require("../models/Institute");
const Student = require("../models/Student");
const Course = require("../models/Course");
const License = require("../models/License");
const Session = require("../models/Session");
const asyncHandler = require("../middlewares/asyncHandler");
const { sendResponse, sendError } = require("../utils/apiResponse");
const uploadToAws = require("../utils/awsUpload");
const { bulkRowSchema } = require("../validation/studentValidation");

const signToken = (id, session_id) =>
  jwt.sign({ id, role: "student", session_id }, process.env.JWT_SECRET, {
    expiresIn: process.env.JWT_EXPIRES_IN,
  });

// ── College: create student ───────────────────────────────────────────────────
const create = asyncHandler(async (req, res) => {
  const {
    full_name,
    email,
    phone,
    roll_no,
    enrollment_no,
    batch,
    course,
    year,
    institute_id,
  } = req.body;

  if (!enrollment_no)
    return sendError(res, 400, false, "enrollment_no is required.");

  const existing = await Student.findOne({ enrollment_no });
  if (existing)
    return sendError(res, 409, false, "Enrollment number already registered.");

  if (email) {
    const emailTaken = await Student.findOne({ email: email.toLowerCase() });
    if (emailTaken)
      return sendError(res, 409, false, "Email already registered.");
  }

  const instituteExists = await Institute.exists({ _id: institute_id });
  if (!instituteExists)
    return sendError(res, 404, false, "Institute not found.");

  let profilePhoto = "";
  if (req.file) {
    const uploaded = await uploadToAws({
      file: req.file,
      fileName: `student_${Date.now()}`,
      folderName: "students",
    });
    profilePhoto = uploaded?.cdnUrl || uploaded?.fullS3URL || "";
  }

  const student = await Student.create({
    full_name,
    email: email ? email.toLowerCase() : undefined,
    phone,
    profilePhoto,
    roll_no,
    enrollment_no,
    batch,
    course,
    year,
    institute_id,
  });

  return sendResponse(res, 201, true, "Student created successfully.", {
    id: student._id,
    full_name: student.full_name,
    enrollment_no: student.enrollment_no,
    roll_no: student.roll_no,
    institute_id: student.institute_id,
  });
});

// ── College / Admin: get all students ────────────────────────────────────────
const getAll = asyncHandler(async (req, res) => {
  const matchStage = req.institute
    ? { institute_id: new Types.ObjectId(req.institute._id) }
    : {};

  const students = await Student.aggregate([
    { $match: matchStage },
    { $sort: { createdAt: -1 } },
    {
      $lookup: {
        from: "institutes",
        localField: "institute_id",
        foreignField: "_id",
        as: "institute",
        pipeline: [{ $project: { institute_name: 1, institute_code: 1 } }],
      },
    },
    { $unwind: { path: "$institute", preserveNullAndEmptyArrays: true } },
  ]);

  return sendResponse(
    res,
    200,
    true,
    "Students fetched successfully.",
    students,
  );
});

// ── College / Admin: get one student ─────────────────────────────────────────
const getOne = asyncHandler(async (req, res) => {
  const [student] = await Student.aggregate([
    { $match: { _id: new Types.ObjectId(req.params.id) } },
    {
      $lookup: {
        from: "institutes",
        localField: "institute_id",
        foreignField: "_id",
        as: "institute",
        pipeline: [
          { $project: { institute_name: 1, institute_code: 1, logo: 1 } },
        ],
      },
    },
    { $unwind: { path: "$institute", preserveNullAndEmptyArrays: true } },
    {
      $lookup: {
        from: "licenses",
        localField: "license_id",
        foreignField: "_id",
        as: "license",
        pipeline: [{ $project: { license_key: 1, status: 1, expiry_date: 1 } }],
      },
    },
    { $unwind: { path: "$license", preserveNullAndEmptyArrays: true } },
  ]);

  if (!student) return sendError(res, 404, false, "Student not found.");

  return sendResponse(res, 200, true, "Student fetched successfully.", student);
});

// ── College: update student ───────────────────────────────────────────────────
const update = asyncHandler(async (req, res) => {
  const student = await Student.findById(req.params.id);
  if (!student) return sendError(res, 404, false, "Student not found.");

  const {
    full_name,
    phone,
    roll_no,
    enrollment_no,
    batch,
    course,
    year,
    status,
    is_active,
  } = req.body;

  if (full_name !== undefined) student.full_name = full_name;
  if (phone !== undefined) student.phone = phone;
  if (roll_no !== undefined) student.roll_no = roll_no;
  if (enrollment_no !== undefined) student.enrollment_no = enrollment_no;
  if (batch !== undefined) student.batch = batch;
  if (course !== undefined) student.course = course;
  if (year !== undefined) student.year = year;
  if (status !== undefined) student.status = status;
  if (is_active !== undefined) student.is_active = is_active;

  if (req.file) {
    const uploaded = await uploadToAws({
      file: req.file,
      fileName: `student_${Date.now()}`,
      folderName: "students",
    });
    student.profilePhoto = uploaded?.cdnUrl || uploaded?.fullS3URL || "";
  }

  await student.save();

  return sendResponse(res, 200, true, "Student updated successfully.", student);
});

// ── College: soft delete ──────────────────────────────────────────────────────
const remove = asyncHandler(async (req, res) => {
  const student = await Student.findById(req.params.id);
  if (!student) return sendError(res, 404, false, "Student not found.");

  student.is_active = false;
  student.status = "inactive";
  await student.save();

  return sendResponse(res, 200, true, "Student deactivated successfully.");
});

// ── College: toggle status ────────────────────────────────────────────────────
const toggleStatus = asyncHandler(async (req, res) => {
  const student = await Student.findById(req.params.id);
  if (!student) return sendError(res, 404, false, "Student not found.");

  student.is_active = !student.is_active;
  student.status = student.is_active ? "active" : "inactive";
  await student.save();

  return sendResponse(
    res,
    200,
    true,
    `Student ${student.is_active ? "activated" : "deactivated"} successfully.`,
    { is_active: student.is_active, status: student.status },
  );
});

// ── Student: login (checks license seats) ────────────────────────────────────
const login = asyncHandler(async (req, res) => {
  const { enrollment_no } = req.body;

  if (!enrollment_no)
    return sendError(res, 400, false, "enrollment_no is required.");

  const student = await Student.findOne({ enrollment_no });
  if (!student)
    return sendError(
      res,
      401,
      false,
      "No account found with this enrollment number.",
    );

  if (!student.is_active || student.status !== "active")
    return sendError(
      res,
      403,
      false,
      "Your account has been suspended. Contact your institute.",
    );

  // Load institute to get license_ids[]
  const Institute = require("../models/Institute");
  const institute = await Institute.findById(student.institute_id);

  if (!institute) {
    return sendError(res, 403, false, "Institute not found.");
  }

  if (!institute.license_ids || institute.license_ids.length === 0) {
    return sendError(
      res,
      403,
      false,
      "Your institute does not have any license keys. Contact admin.",
    );
  }

  const now = new Date();

  // Close ALL of this student's active sessions (there may be multiple from repeated logins).
  await Session.updateMany(
    { student_id: student._id, is_active: true },
    { $set: { is_active: false } },
  );

  // Recalibrate active_sessions on every license in this institute by counting
  // actual live (non-expired) sessions. This corrects any counter drift from
  // crashes, repeated test logins, missed logouts, or cron delays.
  const liveCounts = await Session.aggregate([
    {
      $match: {
        license_id: { $in: institute.license_ids },
        is_active: true,
        expires_at: { $gt: now },
      },
    },
    { $group: { _id: "$license_id", count: { $sum: 1 } } },
  ]);

  const countMap = {};
  for (const row of liveCounts) {
    countMap[row._id.toString()] = row.count;
  }

  await Promise.all(
    institute.license_ids.map((licId) =>
      License.findByIdAndUpdate(licId, {
        $set: { active_sessions: countMap[licId.toString()] ?? 0 },
      }),
    ),
  );

  // Find any license key that is active, not expired, and has a free seat
  let license = await License.findOne({
    _id: { $in: institute.license_ids },
    status: "active",
    start_date: { $lte: now },
    expiry_date: { $gte: now },
    $expr: { $lt: ["$active_sessions", "$total_seats"] },
  });

  if (!license) {
    // Find out exact reason for better error message
    const anyActive = await License.findOne({
      _id: { $in: institute.license_ids },
      status: "active",
    });

    if (!anyActive) {
      return sendError(
        res,
        403,
        false,
        "Your institute license is not active. Contact admin.",
      );
    }

    const notExpired = await License.findOne({
      _id: { $in: institute.license_ids },
      status: "active",
      expiry_date: { $gte: now },
    });

    if (!notExpired) {
      return sendError(
        res,
        403,
        false,
        "Your institute license has expired. Contact admin.",
      );
    }

    const started = await License.findOne({
      _id: { $in: institute.license_ids },
      status: "active",
      expiry_date: { $gte: now },
      start_date: { $lte: now },
    });

    if (!started) {
      return sendError(
        res,
        403,
        false,
        "Your institute license has not started yet. Contact admin.",
      );
    }

    const debugLicenses = await License.find(
      { _id: { $in: institute.license_ids } },
      {
        license_code: 1,
        status: 1,
        active_sessions: 1,
        total_seats: 1,
        start_date: 1,
        expiry_date: 1,
      },
    ).lean();

    const debugSessions = await Session.find(
      { license_id: { $in: institute.license_ids }, is_active: true },
      { student_id: 1, license_id: 1, expires_at: 1, is_active: 1 },
    ).lean();

    return res.status(403).json({
      statusCode: 403,
      success: false,
      message: `All ${institute.license_count} seats are currently in use.`,
      debug: {
        now,
        licenses: debugLicenses,
        active_sessions_in_db: debugSessions,
      },
    });
  }

  // Atomically grab the seat
  await License.findByIdAndUpdate(license._id, {
    $inc: { active_sessions: 1 },
  });

  // Create session (expires in 8 hours)
  const expiresAt = new Date(Date.now() + 8 * 60 * 60 * 1000);
  const session = await Session.create({
    student_id: student._id,
    license_id: license._id,
    institute_id: student.institute_id,
    expires_at: expiresAt,
    is_active: true,
  });

  student.last_login = new Date();
  student.license_id = license._id;
  await student.save();

  const token = signToken(student._id, session._id);

  // Store token in session for invalidation
  await Session.findByIdAndUpdate(session._id, { token });

  return sendResponse(res, 200, true, `Welcome back, ${student.full_name}!`, {
    token,
    student: {
      id: student._id,
      full_name: student.full_name,
      email: student.email,
      role: student.role,
      roll_no: student.roll_no,
      institute_id: student.institute_id,
      institute_name: institute.institute_name,
      profilePhoto: student.profilePhoto,
      last_login: student.last_login,
    },
  });
});

// ── Student: logout (frees seat + deactivates session) ───────────────────────
const logout = asyncHandler(async (req, res) => {
  if (req.session_id) {
    const session = await Session.findById(req.session_id);
    if (session && session.is_active) {
      await Session.findByIdAndUpdate(req.session_id, { is_active: false });
      await License.findByIdAndUpdate(session.license_id, {
        $inc: { active_sessions: -1 },
      });
    }
  }

  return sendResponse(res, 200, true, "Logged out successfully.");
});

// ── Student: own profile ──────────────────────────────────────────────────────
const getMe = asyncHandler(async (req, res) => {
  const [student] = await Student.aggregate([
    { $match: { _id: new Types.ObjectId(req.student._id) } },
    {
      $lookup: {
        from: "institutes",
        localField: "institute_id",
        foreignField: "_id",
        as: "institute",
        pipeline: [
          { $project: { institute_name: 1, institute_code: 1, logo: 1 } },
        ],
      },
    },
    { $unwind: { path: "$institute", preserveNullAndEmptyArrays: true } },
  ]);

  return sendResponse(res, 200, true, "Profile fetched successfully.", student);
});

// ── Student: update own profile ───────────────────────────────────────────────
const updateMe = asyncHandler(async (req, res) => {
  const student = await Student.findById(req.student._id);

  const { full_name, phone } = req.body;

  if (full_name !== undefined) student.full_name = full_name;
  if (phone !== undefined) student.phone = phone;

  if (req.file) {
    const uploaded = await uploadToAws({
      file: req.file,
      fileName: `student_${Date.now()}`,
      folderName: "students",
    });
    student.profilePhoto = uploaded?.cdnUrl || uploaded?.fullS3URL || "";
  }

  await student.save();

  return sendResponse(res, 200, true, "Profile updated successfully.", student);
});

// ── College: bulk upload students from Excel ──────────────────────────────────
const bulkUpload = asyncHandler(async (req, res) => {
  if (!req.file) return sendError(res, 400, false, "Excel file is required.");

  const institute_id = req.body.institute_id || req.institute?._id;
  if (!institute_id)
    return sendError(res, 400, false, "institute_id is required.");

  const instituteExists = await Institute.exists({ _id: institute_id });
  if (!instituteExists)
    return sendError(res, 404, false, "Institute not found.");

  // Parse Excel
  const workbook = xlsx.readFile(req.file.path);
  const sheet = workbook.Sheets[workbook.SheetNames[0]];
  const rows = xlsx.utils.sheet_to_json(sheet, { defval: "" });

  if (!rows.length) return sendError(res, 400, false, "Excel file is empty.");

  const created = [];
  const failed = [];
  const seenEmails = new Set();
  const seenEnrollments = new Set();

  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];
    const rowNum = i + 2;

    const fields = {
      full_name: String(row["full_name"] || row["Full Name"] || "").trim(),
      email:
        String(row["email"] || row["Email"] || "")
          .trim()
          .toLowerCase() || null,
      phone: String(row["phone"] || row["Phone"] || "").trim() || null,
      roll_no: String(row["roll_no"] || row["Roll No"] || "").trim(),
      enrollment_no: String(
        row["enrollment_no"] || row["Enrollment No"] || "",
      ).trim(),
      batch: String(row["batch"] || row["Batch"] || "").trim() || null,
      course: String(row["course"] || row["Course"] || "").trim() || null,
      year: Number(row["year"] || row["Year"]) || null,
    };

    const { error: rowError, value: validated } = bulkRowSchema.validate(
      fields,
      {
        abortEarly: false,
        stripUnknown: true,
      },
    );

    if (rowError) {
      failed.push({
        row: rowNum,
        enrollment_no: fields.enrollment_no || "—",
        reason: rowError.details
          .map((d) => d.message.replace(/['"]/g, ""))
          .join("; "),
      });
      continue;
    }

    // Duplicate enrollment_no within this upload batch
    if (seenEnrollments.has(validated.enrollment_no)) {
      failed.push({
        row: rowNum,
        enrollment_no: validated.enrollment_no,
        reason: "Duplicate enrollment_no within this upload file",
      });
      continue;
    }
    seenEnrollments.add(validated.enrollment_no);

    // Duplicate email within this upload batch — clear it rather than fail the row
    if (validated.email && seenEmails.has(validated.email)) {
      validated.email = null;
    } else if (validated.email) {
      seenEmails.add(validated.email);
    }

    // DB-level duplicate checks
    const existing = await Student.findOne({
      enrollment_no: validated.enrollment_no,
    });
    if (existing) {
      failed.push({
        row: rowNum,
        enrollment_no: validated.enrollment_no,
        reason: "Enrollment number already registered",
      });
      continue;
    }

    let finalEmail = validated.email || undefined;
    if (finalEmail) {
      const emailTaken = await Student.findOne({ email: finalEmail });
      if (emailTaken) finalEmail = undefined;
    }

    try {
      const student = new Student({
        full_name: validated.full_name,
        email: finalEmail,
        phone: validated.phone || undefined,
        roll_no: validated.roll_no,
        enrollment_no: validated.enrollment_no,
        batch: validated.batch || undefined,
        course: validated.course || undefined,
        year: validated.year || undefined,
        institute_id,
      });
      await student.save();

      created.push({
        row: rowNum,
        enrollment_no: validated.enrollment_no,
        id: student._id,
      });
    } catch (err) {
      failed.push({
        row: rowNum,
        enrollment_no: validated.enrollment_no,
        reason: err.message,
      });
    }
  }

  if (created.length === 0) {
    return sendError(
      res,
      400,
      false,
      "Bulk upload failed. No students were created.",
      {
        total: rows.length,
        created: 0,
        failed: failed.length,
        errors: failed,
      },
    );
  }

  const message =
    failed.length === 0
      ? `Bulk upload complete. ${created.length} student(s) created successfully.`
      : `Bulk upload partial. ${created.length} created, ${failed.length} failed.`;

  return sendResponse(res, 201, true, message, {
    total: rows.length,
    created: created.length,
    failed: failed.length,
    created_students: created,
    errors: failed,
  });
});

// ── Student: list courses available at their institute ────────────────────────
const getAvailableCourses = asyncHandler(async (req, res) => {
  const student = await Student.findById(req.student._id).select("institute_id purchased_courses");

  const institute = await Institute.findById(student.institute_id)
    .select("course_id")
    .populate({
      path: "course_id",
      match: { is_active: true },
      select: "course_name course_code description level language duration_days thumbnail_url",
    });

  if (!institute) return sendError(res, 404, false, "Institute not found.");

  const purchasedSet = new Set((student.purchased_courses || []).map((id) => id.toString()));

  const courses = (institute.course_id || []).map((c) => ({
    ...c.toObject(),
    is_enrolled: purchasedSet.has(c._id.toString()),
  }));

  return sendResponse(res, 200, true, "Available courses fetched.", courses);
});

// ── Student: enroll / purchase a course ──────────────────────────────────────
const purchaseCourse = asyncHandler(async (req, res) => {
  const { course_id } = req.body;

  const course = await Course.findOne({ _id: course_id, is_active: true });
  if (!course) return sendError(res, 404, false, "Course not found or inactive.");

  const student = await Student.findById(req.student._id);

  const institute = await Institute.findById(student.institute_id).select("course_id");
  if (!institute) return sendError(res, 404, false, "Institute not found.");

  const offeredByInstitute = institute.course_id.some(
    (id) => id.toString() === course_id,
  );
  if (!offeredByInstitute)
    return sendError(res, 403, false, "This course is not available at your institute.");

  const alreadyEnrolled = (student.purchased_courses || []).some(
    (id) => id.toString() === course_id,
  );
  if (alreadyEnrolled)
    return sendError(res, 409, false, "You are already enrolled in this course.");

  student.purchased_courses.push(course_id);
  await student.save();

  return sendResponse(res, 200, true, "Enrolled in course successfully.", {
    course_id: course._id,
    course_name: course.course_name,
    course_code: course.course_code,
    level: course.level,
    language: course.language,
    duration_days: course.duration_days,
    thumbnail_url: course.thumbnail_url,
  });
});

// ── Student: list own enrolled courses ────────────────────────────────────────
const getMyCourses = asyncHandler(async (req, res) => {
  const [student] = await Student.aggregate([
    { $match: { _id: new Types.ObjectId(req.student._id) } },
    {
      $lookup: {
        from: "courses",
        localField: "purchased_courses",
        foreignField: "_id",
        as: "purchased_courses",
        pipeline: [
          { $match: { is_active: true } },
          {
            $project: {
              course_name: 1,
              course_code: 1,
              description: 1,
              level: 1,
              language: 1,
              duration_days: 1,
              thumbnail_url: 1,
            },
          },
        ],
      },
    },
    { $project: { purchased_courses: 1 } },
  ]);

  return sendResponse(res, 200, true, "Enrolled courses fetched.", student?.purchased_courses ?? []);
});

module.exports = {
  create,
  getAll,
  getOne,
  update,
  remove,
  toggleStatus,
  login,
  logout,
  getMe,
  updateMe,
  bulkUpload,
  getAvailableCourses,
  purchaseCourse,
  getMyCourses,
};
