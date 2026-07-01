const jwt = require("jsonwebtoken");

const SuperAdmin = require("../models/SuperAdmin");
const Institute = require("../models/Institute");
const Student = require("../models/Student");
const License = require("../models/License");
const Course = require("../models/Course");
const Topic = require("../models/Topic");
const Editor = require("../models/Editor");
const StudentModuleAttempt = require("../models/StudentModuleAttempt");
const uploadToAws = require("../utils/awsUpload");

const asyncHandler = require("../middlewares/asyncHandler");
const { sendResponse, sendError } = require("../utils/apiResponse");

const signToken = (id) => {
  return jwt.sign(
    {
      id,
      role: "super_admin",
    },
    process.env.JWT_SECRET,
    {
      expiresIn: process.env.JWT_EXPIRES_IN,
    },
  );
};

const register = asyncHandler(async (req, res) => {
  const { full_name, email, password, phone } = req.body;

  const existing = await SuperAdmin.findOne({
    email,
  });

  if (existing) {
    return sendError(res, 409, false, "Email already registered.");
  }

  let profileImage = "";

  if (req.file) {
    const uploadedFile = await uploadToAws({
      file: req.file,
      fileName: `super_admin_${Date.now()}`,
      folderName: "super-admin",
    });

    profileImage = uploadedFile?.cdnUrl || uploadedFile?.fullS3URL || "";
  }

  const admin = await SuperAdmin.create({
    full_name,
    email,
    password,
    phone,
    profileImage,
  });

  const token = signToken(admin._id);

  return sendResponse(res, 201, true, "Super Admin registered successfully.", {
    token,
    admin: {
      id: admin._id,
      full_name: admin.full_name,
      email: admin.email,
      role: admin.role,
      profileImage: admin.profileImage,
    },
  });
});

const login = asyncHandler(async (req, res) => {
  const { email, password } = req.body;

  const admin = await SuperAdmin.findOne({
    email,
  }).select("+password");

  if (!admin) {
    return sendError(res, 401, false, "Invalid email or password.");
  }

  const isMatch = await admin.comparePassword(password);

  if (!isMatch) {
    return sendError(res, 401, false, "Invalid email or password.");
  }

  if (!admin.is_active) {
    return sendError(res, 403, false, "Account is inactive.");
  }

  admin.last_login = new Date();

  await admin.save();

  const token = signToken(admin._id);

  return sendResponse(res, 200, true, "Login successful.", {
    token,
    admin: {
      id: admin._id,
      full_name: admin.full_name,
      email: admin.email,
      role: admin.role,
      profileImage: admin.profileImage,
      last_login: admin.last_login,
    },
  });
});

const getProfile = asyncHandler(async (req, res) => {
  const admin = await SuperAdmin.findById(req.admin._id);

  if (!admin) {
    return sendError(res, 404, false, "Super Admin not found.");
  }

  return sendResponse(res, 200, true, "Profile fetched successfully.", admin);
});

const updateProfile = asyncHandler(async (req, res) => {
  const admin = await SuperAdmin.findById(req.admin._id);

  if (!admin) {
    return sendError(res, 404, false, "Super Admin not found.");
  }

  if (req.body.full_name) {
    admin.full_name = req.body.full_name;
  }

  if (req.body.phone) {
    admin.phone = req.body.phone;
  }

  if (req.file) {
    const uploadedFile = await uploadToAws({
      file: req.file,
      fileName: `super_admin_${Date.now()}`,
      folderName: "super-admin",
    });

    admin.profileImage = uploadedFile?.cdnUrl || uploadedFile?.fullS3URL || "";
  }

  await admin.save();

  return sendResponse(res, 200, true, "Profile updated successfully.", admin);
});

const changePassword = asyncHandler(async (req, res) => {
  const { current_password, new_password } = req.body;

  const admin = await SuperAdmin.findById(req.admin._id).select("+password");

  if (!admin) {
    return sendError(res, 404, false, "Super Admin not found.");
  }

  const isMatch = await admin.comparePassword(current_password);

  if (!isMatch) {
    return sendError(res, 401, false, "Current password is incorrect.");
  }

  admin.password = new_password;

  await admin.save();

  return sendResponse(res, 200, true, "Password changed successfully.");
});

// ── Super Admin: dashboard ────────────────────────────────────────────────────
const getDashboard = asyncHandler(async (req, res) => {
  const now = new Date();
  const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
  const startOfWeek  = new Date(now); startOfWeek.setDate(now.getDate() - 7);
  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const in30Days     = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000);

  const [
    totalInstitutes,
    institutesThisMonth,
    totalStudents,
    studentsThisMonth,
    activeLicenses,
    expiringSoonCount,
    publishedCourses,
    topicsThisWeek,
    totalAssessments,
    recentAssessments,
    activeStudents,
    totalCurators,
    licenseMonitors,
    instituteActivity,
    recentInstitutes,
    recentLicenses,
    recentTopics,
    recentEditors,
  ] = await Promise.all([
    // Stats
    Institute.countDocuments(),
    Institute.countDocuments({ createdAt: { $gte: startOfMonth } }),
    Student.countDocuments(),
    Student.countDocuments({ createdAt: { $gte: startOfMonth } }),
    License.countDocuments({ status: "active" }),
    License.countDocuments({ status: "active", expiry_date: { $gte: now, $lte: in30Days } }),
    Course.countDocuments({ is_active: true }),
    Topic.countDocuments({ createdAt: { $gte: startOfWeek } }),
    StudentModuleAttempt.countDocuments(),
    StudentModuleAttempt.countDocuments({ submitted_at: { $gte: startOfWeek } }),
    Student.countDocuments({ is_active: true }),
    Editor.countDocuments({ is_active: true }),

    // License monitors — expiring within 30 days
    License.aggregate([
      {
        $match: {
          status: "active",
          expiry_date: { $gte: now, $lte: in30Days },
        },
      },
      { $sort: { expiry_date: 1 } },
      { $limit: 10 },
      {
        $lookup: {
          from: "institutes",
          localField: "institute_id",
          foreignField: "_id",
          as: "institute",
          pipeline: [{ $project: { institute_name: 1 } }],
        },
      },
      { $unwind: { path: "$institute", preserveNullAndEmptyArrays: true } },
      {
        $project: {
          institute_name: "$institute.institute_name",
          license_code: 1,
          expiry_date: 1,
          days_left: {
            $ceil: {
              $divide: [{ $subtract: ["$expiry_date", now] }, 86400000],
            },
          },
        },
      },
    ]),

    // Institute activity — new students today, grouped by institute
    Student.aggregate([
      { $match: { createdAt: { $gte: startOfToday } } },
      { $group: { _id: "$institute_id", new_students: { $sum: 1 }, last_at: { $max: "$createdAt" } } },
      { $sort: { last_at: -1 } },
      { $limit: 10 },
      {
        $lookup: {
          from: "institutes",
          localField: "_id",
          foreignField: "_id",
          as: "institute",
          pipeline: [{ $project: { institute_name: 1 } }],
        },
      },
      { $unwind: { path: "$institute", preserveNullAndEmptyArrays: true } },
      {
        $project: {
          _id: 0,
          institute_name: "$institute.institute_name",
          new_students: 1,
          time: "$last_at",
        },
      },
    ]),

    // Audit log sources
    Institute.find({}, { institute_name: 1, createdAt: 1 }).sort({ createdAt: -1 }).limit(3).lean(),
    License.find({}, { license_code: 1, institute_id: 1, createdAt: 1 }).sort({ createdAt: -1 }).limit(3)
      .populate("institute_id", "institute_name").lean(),
    Topic.find({}, { title: 1, createdAt: 1 }).sort({ createdAt: -1 }).limit(3).lean(),
    Editor.find({}, { full_name: 1, createdAt: 1 }).sort({ createdAt: -1 }).limit(3).lean(),
  ]);

  // Build audit log from recent records across collections
  const auditEvents = [
    ...recentInstitutes.map((i) => ({
      type: "institute_registered",
      title: "New Institute Registered",
      description: `${i.institute_name} was registered onto the platform database.`,
      time: i.createdAt,
    })),
    ...recentLicenses.map((l) => ({
      type: "license_assigned",
      title: "License Agreement Extended",
      description: `${l.institute_id?.institute_name || "An institute"} license (${l.license_code}) was assigned.`,
      time: l.createdAt,
    })),
    ...recentTopics.map((t) => ({
      type: "curriculum_update",
      title: "Curriculum Update Published",
      description: `Topic '${t.title}' was published to the curriculum.`,
      time: t.createdAt,
    })),
    ...recentEditors.map((e) => ({
      type: "editor_created",
      title: "Instructor Access Created",
      description: `Instructor profile initialized for ${e.full_name}.`,
      time: e.createdAt,
    })),
  ]
    .sort((a, b) => new Date(b.time) - new Date(a.time))
    .slice(0, 8);

  return sendResponse(res, 200, true, "Dashboard data fetched.", {
    stats: {
      total_institutes:   { count: totalInstitutes,  this_month: institutesThisMonth },
      total_students:     { count: totalStudents,     this_month: studentsThisMonth },
      active_licenses:    { count: activeLicenses,    expiring_soon: expiringSoonCount },
      published_courses:  { count: publishedCourses,  topics_this_week: topicsThisWeek },
      assessments_taken:  { count: totalAssessments,  submitted_recently: recentAssessments },
    },
    license_monitors:   licenseMonitors,
    institute_activity: instituteActivity,
    recent_audit_log:   auditEvents,
    user_engagement: {
      active_students: activeStudents,
      curators:        totalCurators,
      tests:           totalAssessments,
    },
  });
});

module.exports = {
  register,
  login,
  getProfile,
  updateProfile,
  changePassword,
  getDashboard,
};
