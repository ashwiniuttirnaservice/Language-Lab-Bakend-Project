const jwt = require("jsonwebtoken");
const bcrypt = require("bcryptjs");
const xlsx = require("xlsx");
const { Types } = require("mongoose");

const Student = require("../models/Student");
const License = require("../models/License");
const Session = require("../models/Session");
const asyncHandler = require("../middlewares/asyncHandler");
const { sendResponse, sendError } = require("../utils/apiResponse");
const uploadToAws = require("../utils/awsUpload");

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

  if (!enrollment_no) return sendError(res, 400, false, "enrollment_no is required.");

  const existing = await Student.findOne({ enrollment_no });
  if (existing) return sendError(res, 409, false, "Enrollment number already registered.");

  if (email) {
    const emailTaken = await Student.findOne({ email: email.toLowerCase() });
    if (emailTaken) return sendError(res, 409, false, "Email already registered.");
  }

  // Look up institute to build auto-generated password
  const Institute = require("../models/Institute");
  const institute = await Institute.findById(institute_id).select("institute_code");
  if (!institute) return sendError(res, 404, false, "Institute not found.");

  // Auto-generated password: institute_code + enrollment_no (hyphens stripped)
  const plainPassword = `${institute.institute_code}${enrollment_no.replace(/-/g, "")}`;
  const hashedPassword = await bcrypt.hash(plainPassword, 12);

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
    password: hashedPassword,
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
    // plain password returned once so institute can distribute it
    generated_password: plainPassword,
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
    { $project: { password: 0 } },
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
        pipeline: [{ $project: { institute_name: 1, institute_code: 1, logo: 1 } }],
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
    { $project: { password: 0 } },
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
  const { enrollment_no, password } = req.body;

  if (!enrollment_no) return sendError(res, 400, false, "enrollment_no is required.");

  const student = await Student.findOne({ enrollment_no }).select("+password");
  if (!student) return sendError(res, 401, false, "No account found with this enrollment number.");

  const isMatch = await bcrypt.compare(password, student.password);
  if (!isMatch) return sendError(res, 401, false, "Incorrect password. Please try again.");

  if (!student.is_active || student.status !== "active")
    return sendError(res, 403, false, "Your account has been suspended. Contact your institute.");

  // Load institute to get license_ids[]
  const Institute = require("../models/Institute");
  const institute = await Institute.findById(student.institute_id);

  if (!institute) {
    return sendError(res, 403, false, "Institute not found.");
  }

  if (!institute.license_ids || institute.license_ids.length === 0) {
    return sendError(res, 403, false, "Your institute does not have any license keys. Contact admin.");
  }

  // Find any license key that is active, not expired, and has a free seat
  // total_seats is always 1 per key — so active_sessions must be 0 for a free seat
  const now = new Date();
  const license = await License.findOne({
    _id: { $in: institute.license_ids },
    status: "active",
    start_date: { $lte: now },
    expiry_date: { $gte: now },
    active_sessions: { $lt: 1 },
  });

  if (!license) {
    // Find out exact reason for better error message
    const anyActive = await License.findOne({
      _id: { $in: institute.license_ids },
      status: "active",
    });

    if (!anyActive) {
      return sendError(res, 403, false, "Your institute license is not active. Contact admin.");
    }

    const notExpired = await License.findOne({
      _id: { $in: institute.license_ids },
      status: "active",
      expiry_date: { $gte: now },
    });

    if (!notExpired) {
      return sendError(res, 403, false, "Your institute license has expired. Contact admin.");
    }

    const started = await License.findOne({
      _id: { $in: institute.license_ids },
      status: "active",
      expiry_date: { $gte: now },
      start_date: { $lte: now },
    });

    if (!started) {
      return sendError(res, 403, false, "Your institute license has not started yet. Contact admin.");
    }

    return sendError(
      res,
      403,
      false,
      `All ${institute.license_count} seats are currently in use. Please try again in a few minutes.`,
    );
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
        pipeline: [{ $project: { institute_name: 1, institute_code: 1, logo: 1 } }],
      },
    },
    { $unwind: { path: "$institute", preserveNullAndEmptyArrays: true } },
    { $project: { password: 0 } },
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

// ── Student: change password ──────────────────────────────────────────────────
const changePassword = asyncHandler(async (req, res) => {
  const { current_password, new_password } = req.body;

  const student = await Student.findById(req.student._id).select("+password");

  const isMatch = await bcrypt.compare(current_password, student.password);
  if (!isMatch)
    return sendError(res, 401, false, "Current password is incorrect.");

  student.password = await bcrypt.hash(new_password, 12);
  await student.save();

  return sendResponse(res, 200, true, "Password changed successfully.");
});

// ── College: bulk upload students from Excel ──────────────────────────────────
const bulkUpload = asyncHandler(async (req, res) => {
  if (!req.file) return sendError(res, 400, false, "Excel file is required.");

  const institute_id = req.body.institute_id || req.institute?._id;
  if (!institute_id) return sendError(res, 400, false, "institute_id is required.");

  const Institute = require("../models/Institute");
  const institute = await Institute.findById(institute_id).select("institute_code");
  if (!institute) return sendError(res, 404, false, "Institute not found.");

  // Parse Excel
  const workbook = xlsx.readFile(req.file.path);
  const sheet = workbook.Sheets[workbook.SheetNames[0]];
  const rows = xlsx.utils.sheet_to_json(sheet, { defval: "" });

  if (!rows.length) return sendError(res, 400, false, "Excel file is empty.");

  const created = [];
  const failed = [];

  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];
    const rowNum = i + 2;

    const full_name = String(row["full_name"] || row["Full Name"] || "").trim();
    const email = String(row["email"] || row["Email"] || "").trim().toLowerCase() || undefined;
    const roll_no = String(row["roll_no"] || row["Roll No"] || "").trim();
    const enrollment_no = String(row["enrollment_no"] || row["Enrollment No"] || "").trim();

    if (!full_name || !roll_no || !enrollment_no) {
      failed.push({
        row: rowNum,
        enrollment_no: enrollment_no || "—",
        reason: "Missing required field: full_name, roll_no, or enrollment_no",
      });
      continue;
    }

    const existing = await Student.findOne({ enrollment_no });
    if (existing) {
      failed.push({ row: rowNum, enrollment_no, reason: "Enrollment number already registered" });
      continue;
    }

    try {
      // Auto-generate password: institute_code + enrollment_no (hyphens stripped)
      const plainPassword = `${institute.institute_code}${enrollment_no.replace(/-/g, "")}`;
      const hashedPassword = await bcrypt.hash(plainPassword, 12);

      const student = new Student({
        full_name,
        email,
        password: hashedPassword,
        roll_no,
        enrollment_no,
        batch: String(row["batch"] || row["Batch"] || "").trim() || undefined,
        course: String(row["course"] || row["Course"] || "").trim() || undefined,
        year: Number(row["year"] || row["Year"]) || undefined,
        phone: String(row["phone"] || row["Phone"] || "").trim() || undefined,
        institute_id,
      });
      await student.save();

      created.push({
        row: rowNum,
        enrollment_no,
        generated_password: plainPassword,
        id: student._id,
      });
    } catch (err) {
      failed.push({ row: rowNum, enrollment_no, reason: err.message });
    }
  }

  return sendResponse(res, 201, true, "Bulk upload complete.", {
    total: rows.length,
    created: created.length,
    failed: failed.length,
    created_students: created,
    errors: failed,
  });
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
  changePassword,
  bulkUpload,
};
