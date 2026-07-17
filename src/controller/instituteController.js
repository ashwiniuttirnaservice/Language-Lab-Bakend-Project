const crypto = require("crypto");
const bcrypt = require("bcryptjs");
const mongoose = require("mongoose");

const Institute = require("../models/Institute");
const Course = require("../models/Course");
const License = require("../models/License");
const Student = require("../models/Student");
const StudentProgress = require("../models/StudentProgress");
const asyncHandler = require("../middlewares/asyncHandler");
const { sendResponse, sendError } = require("../utils/apiResponse");
const uploadToAws = require("../utils/awsUpload");
const emailService = require("../service/emailService");

// POST /institute
const create = asyncHandler(async (req, res) => {
  const {
    institute_name,
    institute_code,
    email,
    password,
    phone,
    address,
    website,
    max_students,
    course_id,
  } = req.body;

  if (!course_id || (Array.isArray(course_id) && course_id.length === 0)) {
    return sendError(res, 400, false, "At least one course_id is required.");
  }

  // normalize to array — frontend may send a single id or an array
  const courseIds = Array.isArray(course_id) ? course_id : [course_id];

  const courseCount = await Course.countDocuments({ _id: { $in: courseIds }, is_active: true });
  if (courseCount !== courseIds.length) {
    return sendError(res, 404, false, "One or more selected courses not found or are inactive.");
  }

  const existingInstitute = await Institute.findOne({
    $or: [{ email }, { institute_code: institute_code.toUpperCase() }],
  });

  if (existingInstitute) {
    return sendError(
      res,
      409,
      false,
      "Institute with this email or code already exists.",
    );
  }

  let logo = "";
  if (req.file) {
    const uploaded = await uploadToAws({
      file: req.file,
      fileName: `institute_logo_${Date.now()}`,
      folderName: "institutes",
    });

    logo = uploaded?.cdnUrl || uploaded?.fullS3URL || "";
  }

  const hashedPassword = await bcrypt.hash(password, 12);

  const institute = await Institute.create({
    institute_name,
    institute_code: institute_code.toUpperCase(),
    email,
    password: hashedPassword,
    phone,
    address,
    website,
    max_students,
    logo,
    course_id: courseIds,
    role: "institute",
    created_by: req.admin._id,
  });

  // Awaited (not thrown) — sendMail() never rejects, so this can't block/fail creation,
  // but the admin panel needs to know whether the credentials email actually went out.
  const email_sent = await emailService.sendInstituteCredentialsEmail(institute, password);
  if (email_sent) {
    institute.credentials_email_sent_at = new Date();
    await institute.save();
  }

  return sendResponse(res, 201, true, "Institute created successfully.", {
    id: institute._id,
    institute_name: institute.institute_name,
    institute_code: institute.institute_code,
    email: institute.email,
    phone: institute.phone,
    website: institute.website,
    logo: institute.logo,
    address: institute.address,
    is_active: institute.is_active,
    email_sent,
    license_id: institute.license_id || null,
  });
});

// GET /institute
const getAll = asyncHandler(async (req, res) => {
  const institutes = await Institute.aggregate([
    { $match: { is_active: true } },
    { $sort: { createdAt: 1 } },
    {
      $lookup: {
        from: "superadmins",
        localField: "created_by",
        foreignField: "_id",
        as: "created_by",
        pipeline: [{ $project: { full_name: 1, email: 1 } }],
      },
    },
    { $unwind: { path: "$created_by", preserveNullAndEmptyArrays: true } },
    {
      $lookup: {
        from: "licenses",
        localField: "license_id",
        foreignField: "_id",
        as: "license",
        pipeline: [
          {
            $project: {
              license_key: 1,
              status: 1,
              expiry_date: 1,
              total_seats: 1,
              active_sessions: 1,
            },
          },
        ],
      },
    },
    { $unwind: { path: "$license", preserveNullAndEmptyArrays: true } },
    { $project: { password: 0 } },
  ]);

  return sendResponse(
    res,
    200,
    true,
    "Institutes fetched successfully.",
    institutes,
  );
});

// GET /institute/:id
const getOne = asyncHandler(async (req, res) => {
  const { Types } = require("mongoose");

  const [institute] = await Institute.aggregate([
    { $match: { _id: new Types.ObjectId(req.params.id) } },
    {
      $lookup: {
        from: "superadmins",
        localField: "created_by",
        foreignField: "_id",
        as: "created_by",
        pipeline: [{ $project: { full_name: 1, email: 1 } }],
      },
    },
    { $unwind: { path: "$created_by", preserveNullAndEmptyArrays: true } },
    {
      $lookup: {
        from: "licenses",
        localField: "license_id",
        foreignField: "_id",
        as: "license",
        pipeline: [
          {
            $project: {
              license_key: 1,
              license_code: 1,
              status: 1,
              start_date: 1,
              expiry_date: 1,
              duration: 1,
              total_seats: 1,
              active_sessions: 1,
            },
          },
        ],
      },
    },
    { $unwind: { path: "$license", preserveNullAndEmptyArrays: true } },
    {
      $lookup: {
        from: "editors",
        localField: "editors",
        foreignField: "_id",
        as: "editors",
        pipeline: [{ $project: { full_name: 1, email: 1 } }],
      },
    },
    {
      $lookup: {
        from: "courses",
        localField: "course_id",
        foreignField: "_id",
        as: "courses",
        pipeline: [{ $project: { course_name: 1, level: 1, thumbnail_url: 1, is_active: 1 } }],
      },
    },
    { $project: { password: 0 } },
  ]);

  if (!institute) return sendError(res, 404, false, "Institute not found.");

  return sendResponse(res, 200, true, "Institute fetched successfully.", institute);
});

// PUT /institute/:id
const update = asyncHandler(async (req, res) => {
  const institute = await Institute.findById(req.params.id);

  if (!institute) {
    return sendError(res, 404, false, "Institute not found.");
  }

  const {
    institute_name,
    institute_code,
    email,
    password,
    address,
    phone,
    website,
    max_students,
    is_active,
    course_id,
  } = req.body;

  if (course_id !== undefined) {
    const courseIds = Array.isArray(course_id) ? course_id : [course_id];
    if (courseIds.length === 0) {
      return sendError(res, 400, false, "At least one course_id is required.");
    }

    const courseCount = await Course.countDocuments({ _id: { $in: courseIds }, is_active: true });
    if (courseCount !== courseIds.length) {
      return sendError(res, 404, false, "One or more selected courses not found or are inactive.");
    }
  }

  if (email || institute_code) {
    const existingInstitute = await Institute.findOne({
      _id: { $ne: req.params.id },
      $or: [
        ...(email ? [{ email: email.toLowerCase() }] : []),
        ...(institute_code ? [{ institute_code: institute_code.toUpperCase() }] : []),
      ],
    });

    if (existingInstitute) {
      return sendError(
        res,
        409,
        false,
        "Institute email or code already exists.",
      );
    }
  }

  if (institute_name !== undefined) institute.institute_name = institute_name;

  if (institute_code !== undefined)
    institute.institute_code = institute_code.toUpperCase();

  if (email !== undefined) institute.email = email.toLowerCase();

  if (address !== undefined)
    institute.address = { ...(institute.address?.toObject?.() ?? institute.address ?? {}), ...address };

  if (phone !== undefined) institute.phone = phone;

  if (website !== undefined) institute.website = website;

  if (max_students !== undefined) institute.max_students = max_students;

  if (is_active !== undefined) institute.is_active = is_active;

  if (course_id !== undefined)
    institute.course_id = Array.isArray(course_id) ? course_id : [course_id];

  if (password) institute.password = await bcrypt.hash(password, 12);

  if (req.file) {
    const uploaded = await uploadToAws({
      file: req.file,
      fileName: `institute_logo_${Date.now()}`,
      folderName: "institutes",
    });

    institute.logo = uploaded?.cdnUrl || uploaded?.fullS3URL || "";
  }

  await institute.save();

  return sendResponse(res, 200, true, "Institute updated successfully.", institute);
});

// DELETE /institute/:id
const remove = asyncHandler(async (req, res) => {
  const institute = await Institute.findById(req.params.id);

  if (!institute) {
    return sendError(res, 404, false, "Institute not found.");
  }

  institute.is_active = false;
  await institute.save();

  return sendResponse(res, 200, true, "Institute deactivated successfully.");
});

// PUT /institute/:id/toggle-status
const toggleStatus = asyncHandler(async (req, res) => {
  const institute = await Institute.findById(req.params.id);
  if (!institute) return sendError(res, 404, false, "Institute not found.");

  institute.is_active = !institute.is_active;
  await institute.save();

  return sendResponse(
    res,
    200,
    true,
    `Institute ${institute.is_active ? "activated" : "deactivated"} successfully.`,
    { is_active: institute.is_active },
  );
});

// PUT /institute/:id/assign-license
const assignLicense = asyncHandler(async (req, res) => {
  const { license_id } = req.body;

  const license = await License.findById(license_id);
  if (!license) {
    return sendError(res, 404, false, "License not found.");
  }

  if (license.status !== "active") {
    return sendError(res, 400, false, "License is not active.");
  }

  const institute = await Institute.findById(req.params.id);
  if (!institute) {
    return sendError(res, 404, false, "Institute not found.");
  }

  if (license.institute_id.toString() !== institute._id.toString()) {
    return sendError(
      res,
      400,
      false,
      "License does not belong to this institute.",
    );
  }

  if (institute.license_id) {
    return sendError(
      res,
      400,
      false,
      "Institute already has a license assigned.",
    );
  }

  institute.license_id = license._id;
  await institute.save();

  return sendResponse(res, 200, true, "License assigned successfully.", {
    institute_id: institute._id,
    institute_name: institute.institute_name,
    license_id: license._id,
    license_key: license.license_key,
    status: license.status,
  });
});

// POST /institute/login
const login = asyncHandler(async (req, res) => {
  const jwt = require("jsonwebtoken");
  const { email, password } = req.body;

  const institute = await Institute.findOne({ email }).select("+password");
  if (!institute) return sendError(res, 401, false, "Invalid email or password.");

  const isMatch = await bcrypt.compare(password, institute.password);
  if (!isMatch) return sendError(res, 401, false, "Invalid email or password.");

  if (!institute.is_active)
    return sendError(res, 403, false, "Institute account is inactive.");

  const token = jwt.sign(
    { id: institute._id, role: "institute" },
    process.env.JWT_SECRET,
    { expiresIn: process.env.JWT_EXPIRES_IN },
  );

  return sendResponse(res, 200, true, "Login successful.", {
    token,
    institute: {
      id: institute._id,
      institute_name: institute.institute_name,
      institute_code: institute.institute_code,
      email: institute.email,
      logo: institute.logo,
      is_active: institute.is_active,
    },
  });
});

// GET /institute/me
const getMe = asyncHandler(async (req, res) => {
  const { Types } = require("mongoose");

  const [institute] = await Institute.aggregate([
    { $match: { _id: new Types.ObjectId(req.institute._id) } },
    {
      $lookup: {
        from: "licenses",
        localField: "license_id",
        foreignField: "_id",
        as: "license",
        pipeline: [
          {
            $project: {
              license_key: 1,
              license_code: 1,
              status: 1,
              start_date: 1,
              expiry_date: 1,
              total_seats: 1,
              active_sessions: 1,
            },
          },
        ],
      },
    },
    { $unwind: { path: "$license", preserveNullAndEmptyArrays: true } },
    {
      $lookup: {
        from: "editors",
        localField: "editors",
        foreignField: "_id",
        as: "editors",
        pipeline: [{ $project: { full_name: 1, email: 1, profilePhoto: 1 } }],
      },
    },
    { $project: { password: 0 } },
  ]);

  return sendResponse(res, 200, true, "Profile fetched successfully.", institute);
});

// PUT /institute/me
const updateMe = asyncHandler(async (req, res) => {
  const institute = await Institute.findById(req.institute._id);

  const { institute_name, address, phone, website } = req.body;

  if (institute_name !== undefined) institute.institute_name = institute_name;
  if (address !== undefined)
    institute.address = { ...(institute.address?.toObject?.() ?? institute.address ?? {}), ...address };
  if (phone !== undefined) institute.phone = phone;
  if (website !== undefined) institute.website = website;

  if (req.file) {
    const uploaded = await uploadToAws({
      file: req.file,
      fileName: `institute_logo_${Date.now()}`,
      folderName: "institutes",
    });
    institute.logo = uploaded?.cdnUrl || uploaded?.fullS3URL || "";
  }

  await institute.save();

  return sendResponse(res, 200, true, "Profile updated successfully.", institute);
});

// GET /institute/me/courses
const getPurchasedCourses = asyncHandler(async (req, res) => {
  const { Types } = require("mongoose");

  const [institute] = await Institute.aggregate([
    { $match: { _id: new Types.ObjectId(req.institute._id) } },
    {
      $lookup: {
        from: "courses",
        localField: "course_id",
        foreignField: "_id",
        as: "courses",
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
    { $project: { courses: 1, _id: 0 } },
  ]);

  const courses = institute?.courses ?? [];

  return sendResponse(res, 200, true, "Purchased courses fetched.", {
    total: courses.length,
    courses,
  });
});

// GET /institute/me/dashboard
const getDashboard = asyncHandler(async (req, res) => {
  const { Types } = require("mongoose");
  const instituteId = new Types.ObjectId(req.institute._id);

  const institute = await Institute.findById(instituteId).select(
    "institute_name course_id license_ids license_count max_students createdAt",
  );
  if (!institute) return sendError(res, 404, false, "Institute not found.");

  const weekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);

  const [
    totalStudents,
    newStudentsThisWeek,
    studentStatusCounts,
    coursesLicensedCount,
    licenses,
    progressStats,
    recentStudents,
    recentCompletions,
  ] = await Promise.all([
    Student.countDocuments({ institute_id: instituteId }),
    Student.countDocuments({ institute_id: instituteId, createdAt: { $gte: weekAgo } }),
    Student.aggregate([
      { $match: { institute_id: instituteId } },
      { $group: { _id: "$status", count: { $sum: 1 } } },
    ]),
    Course.countDocuments({ _id: { $in: institute.course_id }, is_active: true }),
    License.find({ _id: { $in: institute.license_ids } }).select(
      "status total_seats active_sessions",
    ),
    StudentProgress.aggregate([
      { $match: { institute_id: instituteId } },
      {
        $group: {
          _id: null,
          total: { $sum: 1 },
          completed: { $sum: { $cond: ["$is_completed", 1, 0] } },
        },
      },
    ]),
    Student.find({ institute_id: instituteId })
      .sort({ createdAt: -1 })
      .limit(5)
      .select("full_name createdAt")
      .lean(),
    StudentProgress.find({ institute_id: instituteId, is_completed: true })
      .sort({ completed_at: -1 })
      .limit(5)
      .populate("student_id", "full_name")
      .populate("topic_id", "title")
      .select("completed_at student_id topic_id")
      .lean(),
  ]);

  // ── Student status breakdown ───────────────────────────────────
  const statusBreakdown = { active: 0, inactive: 0, suspended: 0 };
  studentStatusCounts.forEach(({ _id, count }) => {
    if (_id in statusBreakdown) statusBreakdown[_id] = count;
  });

  // ── License / seat usage ───────────────────────────────────────
  const totalSeats = licenses.reduce((sum, l) => sum + l.total_seats, 0);
  const usedSeats = licenses.reduce((sum, l) => sum + l.active_sessions, 0);
  const activeLicenses = licenses.filter((l) => l.status === "active").length;

  // ── Completion rate ─────────────────────────────────────────────
  const { total: progressTotal = 0, completed: progressCompleted = 0 } =
    progressStats[0] || {};
  const completionRate =
    progressTotal > 0 ? Math.round((progressCompleted / progressTotal) * 100) : 0;

  // ── Student growth — cumulative enrolled students, last 6 months ─
  const now = new Date();
  const studentGrowth = [];
  for (let i = 5; i >= 0; i -= 1) {
    const monthIndex = now.getMonth() - i;
    const monthStart = new Date(now.getFullYear(), monthIndex, 1);
    const nextMonthStart = new Date(now.getFullYear(), monthIndex + 1, 1);
    // eslint-disable-next-line no-await-in-loop
    const count = await Student.countDocuments({
      institute_id: instituteId,
      createdAt: { $lt: nextMonthStart },
    });
    studentGrowth.push({
      month: monthStart.toLocaleString("en-US", { month: "short" }),
      students: count,
    });
  }

  // ── Recent activity feed ────────────────────────────────────────
  const recentActivity = [
    ...recentStudents.map((s) => ({
      type: "student_registered",
      message: `${s.full_name} registered`,
      timestamp: s.createdAt,
    })),
    ...recentCompletions.map((p) => ({
      type: "course_completed",
      message: `${p.student_id?.full_name || "A student"} completed ${p.topic_id?.title || "a topic"}`,
      timestamp: p.completed_at,
    })),
  ]
    .sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp))
    .slice(0, 8);

  return sendResponse(res, 200, true, "Dashboard fetched successfully.", {
    institute_name: institute.institute_name,
    enrolled_students: {
      total: totalStudents,
      new_this_week: newStudentsThisWeek,
    },
    courses_licensed: {
      total: coursesLicensedCount,
    },
    license_usage: {
      total_seats: totalSeats || institute.license_count,
      used_seats: usedSeats,
      active_licenses: activeLicenses,
    },
    completion_rate: completionRate,
    student_growth: studentGrowth,
    student_status_breakdown: {
      ...statusBreakdown,
      total: totalStudents,
    },
    recent_activity: recentActivity,
  });
});

// POST /institute/logout
const logout = asyncHandler(async (req, res) => {
  return sendResponse(res, 200, true, "Logged out successfully.", null);
});

// PUT /institute/:id/resend-credentials
// Resets the institute's password to a new random one and emails it — the
// original plain password is never stored, so a genuine "resend" isn't
// possible; this is the secure equivalent (same pattern as a password reset).
const resendCredentials = asyncHandler(async (req, res) => {
  const institute = await Institute.findById(req.params.id);
  if (!institute) return sendError(res, 404, false, "Institute not found.");

  const newPassword = crypto.randomBytes(6).toString("hex");
  institute.password = await bcrypt.hash(newPassword, 12);

  const email_sent = await emailService.sendInstituteCredentialsEmail(institute, newPassword);
  if (email_sent) institute.credentials_email_sent_at = new Date();

  await institute.save();

  return sendResponse(res, 200, true, "Credentials reset and emailed successfully.", {
    id: institute._id,
    email: institute.email,
    password: newPassword, // shown ONCE — cannot be retrieved again
    email_sent,
  });
});

// GET /institute/public/:id
// No auth — only safe, non-sensitive fields for public display (e.g. landing page).
const getPublic = asyncHandler(async (req, res) => {
  if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
    return sendError(res, 404, false, "Institute not found.");
  }

  const institute = await Institute.findOne(
    { _id: req.params.id, is_active: true },
    "institute_name institute_code logo website address.state address.city address.nearbyLandmarks",
  ).lean();

  if (!institute) return sendError(res, 404, false, "Institute not found.");

  return sendResponse(res, 200, true, "Institute fetched successfully.", institute);
});

module.exports = {
  create,
  getAll,
  getOne,
  update,
  remove,
  toggleStatus,
  assignLicense,
  resendCredentials,
  login,
  logout,
  getMe,
  updateMe,
  getPurchasedCourses,
  getDashboard,
  getPublic,
};
