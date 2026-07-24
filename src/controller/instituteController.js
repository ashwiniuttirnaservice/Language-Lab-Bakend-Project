const crypto = require("crypto");
const bcrypt = require("bcryptjs");
const mongoose = require("mongoose");

const Institute = require("../models/Institute");
const Course = require("../models/Course");
const License = require("../models/License");
const Student = require("../models/Student");
const StudentProgress = require("../models/StudentProgress");
const StudentModuleAttempt = require("../models/StudentModuleAttempt");
const ChatHistory = require("../models/ChatHistory");
const ActivityLog = require("../models/ActivityLog");
const Attendance = require("../models/Attendance");
const Session = require("../models/Session");
const Topic = require("../models/Topic");
const SubTopic = require("../models/SubTopic");
const VocabularyModule = require("../models/VocabularyModule");
const AudioModule = require("../models/AudioModule");
const VideoModule = require("../models/VideoModule");
const TextModule = require("../models/TextModule");
const ExerciseModule = require("../models/ExerciseModule");
const asyncHandler = require("../middlewares/asyncHandler");
const { sendResponse, sendError } = require("../utils/apiResponse");
const uploadToAws = require("../utils/awsUpload");
const emailService = require("../service/emailService");
const logger = require("../utils/logger");
const { getInstituteDb, upsertAll } = require("../utils/instituteDb");

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

  const previousCourseIds = institute.course_id.map((id) => id.toString()).sort();

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

  const newCourseIds = institute.course_id.map((id) => id.toString()).sort();
  const coursesChanged =
    course_id !== undefined &&
    (newCourseIds.length !== previousCourseIds.length ||
      newCourseIds.some((id, i) => id !== previousCourseIds[i]));

  if (coursesChanged) {
    const assignedCourses = await Course.find({ _id: { $in: institute.course_id } }).select(
      "course_name",
    );
    await emailService.sendInstituteCourseAssignedEmail(institute, assignedCourses);
  }

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

  // Mirror this institute's own record, all its students, and the metadata
  // (not full content) of every licensed course into the local database.
  // Best-effort — must never block login if it fails.
  try {
    const instituteDb = getInstituteDb();
    await upsertAll(instituteDb.model("Institute"), [institute.toObject()]);

    const students = await Student.find({ institute_id: institute._id }).lean();
    await upsertAll(instituteDb.model("Student"), students);

    const licensedCourses = await Course.find({
      _id: { $in: institute.course_id },
      is_active: true,
    }).lean();
    await upsertAll(instituteDb.model("Course"), licensedCourses);

    // Student activity/history data — same institute_id scope as Student.
    const instituteScope = { institute_id: institute._id };
    const [progress, attempts, chats, activity, attendance, sessions] = await Promise.all([
      StudentProgress.find(instituteScope).lean(),
      StudentModuleAttempt.find(instituteScope).lean(),
      ChatHistory.find(instituteScope).lean(),
      ActivityLog.find(instituteScope).lean(),
      Attendance.find(instituteScope).lean(),
      Session.find(instituteScope).lean(),
    ]);

    await upsertAll(instituteDb.model("StudentProgress"), progress);
    await upsertAll(instituteDb.model("StudentModuleAttempt"), attempts);
    await upsertAll(instituteDb.model("ChatHistory"), chats);
    await upsertAll(instituteDb.model("ActivityLog"), activity);
    await upsertAll(instituteDb.model("Attendance"), attendance);
    await upsertAll(instituteDb.model("Session"), sessions);
  } catch (error) {
    logger.error(`Per-institute DB mirror failed on login (${institute.institute_code}): ${error.message}`);
  }

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
// Reads from the institute's own local database, not the master.
const getMe = asyncHandler(async (req, res) => {
  const instituteDb = getInstituteDb();
  const InstituteLocalModel = instituteDb.model("Institute");

  const institute = await InstituteLocalModel.findById(req.institute._id)
    .select("-password")
    .lean();

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
// Reads from the institute's own local database (course metadata for every
// licensed course is mirrored at login; full content only once downloaded).
const getPurchasedCourses = asyncHandler(async (req, res) => {
  const instituteDb = getInstituteDb();
  const InstituteLocalModel = instituteDb.model("Institute");
  const CourseLocalModel = instituteDb.model("Course");

  const institute = await InstituteLocalModel.findById(req.institute._id)
    .select("course_id downloaded_course_ids")
    .lean();

  const downloadedSet = new Set(
    (institute?.downloaded_course_ids ?? []).map((id) => id.toString()),
  );

  const courseDocs = await CourseLocalModel.find(
    { _id: { $in: institute?.course_id ?? [] }, is_active: true },
    "course_name course_code description level language duration_days thumbnail_url",
  ).lean();

  const courses = courseDocs.map((course) => ({
    ...course,
    is_downloaded: downloadedSet.has(course._id.toString()),
  }));

  return sendResponse(res, 200, true, "Purchased courses fetched.", {
    total: courses.length,
    courses,
  });
});

// GET /institute/me/dashboard
// Reads students/courses from the institute's own local database. License
// data isn't mirrored locally (billing concern), so that part still reads
// from the master.
const getDashboard = asyncHandler(async (req, res) => {
  const { Types } = require("mongoose");
  const instituteId = new Types.ObjectId(req.institute._id);

  const instituteDb = getInstituteDb();
  const InstituteLocalModel = instituteDb.model("Institute");
  const StudentLocalModel = instituteDb.model("Student");
  const StudentProgressLocalModel = instituteDb.model("StudentProgress");
  const CourseLocalModel = instituteDb.model("Course");

  const institute = await InstituteLocalModel.findById(instituteId).select(
    "institute_name course_id downloaded_course_ids license_ids license_count max_students createdAt",
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
    StudentLocalModel.countDocuments({ institute_id: instituteId }),
    StudentLocalModel.countDocuments({ institute_id: instituteId, createdAt: { $gte: weekAgo } }),
    StudentLocalModel.aggregate([
      { $match: { institute_id: instituteId } },
      { $group: { _id: "$status", count: { $sum: 1 } } },
    ]),
    CourseLocalModel.countDocuments({
      _id: { $in: institute.downloaded_course_ids },
      is_active: true,
    }),
    License.find({ _id: { $in: institute.license_ids } }).select(
      "status total_seats active_sessions",
    ),
    StudentProgressLocalModel.aggregate([
      { $match: { institute_id: instituteId } },
      {
        $group: {
          _id: null,
          total: { $sum: 1 },
          completed: { $sum: { $cond: ["$is_completed", 1, 0] } },
        },
      },
    ]),
    StudentLocalModel.find({ institute_id: instituteId })
      .sort({ createdAt: -1 })
      .limit(5)
      .select("full_name createdAt")
      .lean(),
    StudentProgressLocalModel.find({ institute_id: instituteId, is_completed: true })
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
    const count = await StudentLocalModel.countDocuments({
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
      licensed_total: institute.course_id.length,
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

// GET /institute/me/courses/:courseId/download
// Pulls the full content (topics -> sub-topics -> modules) for ONE course
// assigned to this institute — only the course whose Download button was
// clicked, not the institute's whole assigned list.
const downloadCourseData = asyncHandler(async (req, res) => {
  const { courseId } = req.params;

  if (!mongoose.Types.ObjectId.isValid(courseId)) {
    return sendError(res, 404, false, "Course not found.");
  }

  const institute = await Institute.findById(req.institute._id).select("course_id");
  const isAssigned = institute.course_id.some(
    (id) => id.toString() === courseId,
  );
  if (!isAssigned) {
    return sendError(
      res,
      403,
      false,
      "This course is not assigned to your institute.",
    );
  }

  const course = await Course.findOne({
    _id: courseId,
    is_active: true,
  }).lean();
  if (!course) return sendError(res, 404, false, "Course not found.");

  const topics = await Topic.find({
    _id: { $in: course.topic_ids },
    is_active: true,
  })
    .sort({ order: 1 })
    .lean();
  const topicIds = topics.map((t) => t._id);

  const subTopics = await SubTopic.find({
    topic_id: { $in: topicIds },
    is_active: true,
  })
    .sort({ order: 1 })
    .lean();

  const [vocabulary, audio, video, text, exercise] = await Promise.all([
    VocabularyModule.find({ topic_id: { $in: topicIds }, is_active: true }).lean(),
    AudioModule.find({ topic_id: { $in: topicIds }, is_active: true }).lean(),
    VideoModule.find({ topic_id: { $in: topicIds }, is_active: true }).lean(),
    TextModule.find({ topic_id: { $in: topicIds }, is_active: true }).lean(),
    ExerciseModule.find({ topic_id: { $in: topicIds }, is_active: true }).lean(),
  ]);

  const modules = [...vocabulary, ...audio, ...video, ...text, ...exercise];

  const subTopicsByTopic = new Map();
  for (const st of subTopics) {
    const key = st.topic_id.toString();
    const entry = { ...st, modules: [] };
    if (!subTopicsByTopic.has(key)) subTopicsByTopic.set(key, []);
    subTopicsByTopic.get(key).push(entry);
  }

  for (const m of modules) {
    const subTopicList = subTopicsByTopic.get(m.topic_id.toString());
    const st = subTopicList?.find(
      (s) => s._id.toString() === m.sub_topic_id.toString(),
    );
    if (st) st.modules.push(m);
  }

  const topicsWithContent = topics.map((t) => ({
    ...t,
    sub_topics: subTopicsByTopic.get(t._id.toString()) || [],
  }));

  const lastUpdated = latestTimestamp([
    course.updatedAt,
    ...topics.map((t) => t.updatedAt),
    ...subTopics.map((s) => s.updatedAt),
    ...modules.map((m) => m.updatedAt),
  ]);

  // Only downloaded courses can be assigned to students.
  await Institute.updateOne(
    { _id: req.institute._id },
    { $addToSet: { downloaded_course_ids: course._id } },
  );

  // Mirror the pulled content into this institute's own database.
  // Best-effort — must never fail the download response.
  try {
    const instituteDb = getInstituteDb();
    await upsertAll(instituteDb.model("Course"), [course]);
    await upsertAll(instituteDb.model("Topic"), topics);
    await upsertAll(instituteDb.model("SubTopic"), subTopics);
    await upsertAll(instituteDb.model("VocabularyModule"), vocabulary);
    await upsertAll(instituteDb.model("AudioModule"), audio);
    await upsertAll(instituteDb.model("VideoModule"), video);
    await upsertAll(instituteDb.model("TextModule"), text);
    await upsertAll(instituteDb.model("ExerciseModule"), exercise);
  } catch (error) {
    logger.error(`Per-institute DB mirror failed on download (${req.institute.institute_code}, course ${courseId}): ${error.message}`);
  }

  return sendResponse(res, 200, true, "Course data pulled successfully.", {
    course,
    topics: topicsWithContent,
    last_updated: lastUpdated,
  });
});

// Picks the newest timestamp out of a course's own record plus every
// topic/sub-topic/module under it — lets the frontend know a re-download
// is needed without re-pulling the full content each time.
function latestTimestamp(dates) {
  const valid = dates.filter(Boolean).map((d) => new Date(d).getTime());
  return valid.length ? new Date(Math.max(...valid)) : null;
}

// GET /institute/me/courses/:courseId/last-updated
// Lightweight check (timestamps only) so Settings can show "Update Data"
// on a course that was already pulled but has since changed upstream.
const getCourseLastUpdated = asyncHandler(async (req, res) => {
  const { courseId } = req.params;

  if (!mongoose.Types.ObjectId.isValid(courseId)) {
    return sendError(res, 404, false, "Course not found.");
  }

  const institute = await Institute.findById(req.institute._id).select("course_id");
  const isAssigned = institute.course_id.some(
    (id) => id.toString() === courseId,
  );
  if (!isAssigned) {
    return sendError(
      res,
      403,
      false,
      "This course is not assigned to your institute.",
    );
  }

  const course = await Course.findOne({ _id: courseId, is_active: true })
    .select("topic_ids updatedAt")
    .lean();
  if (!course) return sendError(res, 404, false, "Course not found.");

  const topics = await Topic.find({
    _id: { $in: course.topic_ids },
    is_active: true,
  })
    .select("updatedAt")
    .lean();
  const topicIds = topics.map((t) => t._id);

  const subTopics = await SubTopic.find({
    topic_id: { $in: topicIds },
    is_active: true,
  })
    .select("updatedAt")
    .lean();

  const [vocabulary, audio, video, text, exercise] = await Promise.all([
    VocabularyModule.find({ topic_id: { $in: topicIds }, is_active: true }).select("updatedAt").lean(),
    AudioModule.find({ topic_id: { $in: topicIds }, is_active: true }).select("updatedAt").lean(),
    VideoModule.find({ topic_id: { $in: topicIds }, is_active: true }).select("updatedAt").lean(),
    TextModule.find({ topic_id: { $in: topicIds }, is_active: true }).select("updatedAt").lean(),
    ExerciseModule.find({ topic_id: { $in: topicIds }, is_active: true }).select("updatedAt").lean(),
  ]);
  const modules = [...vocabulary, ...audio, ...video, ...text, ...exercise];

  const lastUpdated = latestTimestamp([
    course.updatedAt,
    ...topics.map((t) => t.updatedAt),
    ...subTopics.map((s) => s.updatedAt),
    ...modules.map((m) => m.updatedAt),
  ]);

  return sendResponse(res, 200, true, "Last updated timestamp fetched.", {
    last_updated: lastUpdated,
  });
});

// GET /institute/verify-code/:code
// No auth — confirms an institute_code exists before the login step.
const verifyByCode = asyncHandler(async (req, res) => {
  const code = req.params.code?.trim().toUpperCase();

  const institute = await Institute.findOne(
    { institute_code: code, is_active: true },
    "institute_name institute_code logo",
  ).lean();

  if (!institute) return sendError(res, 404, false, "Invalid institute code.");

  return sendResponse(res, 200, true, "Institute code verified.", institute);
});

// POST /institute/send-otp
// No auth — sends a 6-digit OTP to the institute's registered email so the
// /config flow can verify the institute before the email/password login step.
const sendOtp = asyncHandler(async (req, res) => {
  const code = req.body.institute_code?.trim().toUpperCase();

  const institute = await Institute.findOne({
    institute_code: code,
    is_active: true,
  });
  if (!institute) return sendError(res, 404, false, "Invalid institute code.");

  const otp = crypto.randomInt(100000, 1000000).toString();
  institute.otp_code = otp;
  institute.otp_expires_at = new Date(Date.now() + 10 * 60 * 1000);
  await institute.save();

  const sent = await emailService.sendInstituteOtpEmail(institute, otp);
  if (!sent) return sendError(res, 502, false, "Failed to send OTP email.");

  return sendResponse(res, 200, true, "OTP sent to institute email.", {
    email: institute.email,
  });
});

// POST /institute/verify-otp
// No auth — confirms the OTP sent above, then clears it (single use).
const verifyOtp = asyncHandler(async (req, res) => {
  const code = req.body.institute_code?.trim().toUpperCase();
  const { otp } = req.body;

  const institute = await Institute.findOne(
    { institute_code: code, is_active: true },
  ).select("+otp_code +otp_expires_at");
  if (!institute) return sendError(res, 404, false, "Invalid institute code.");

  if (
    !institute.otp_code ||
    !institute.otp_expires_at ||
    institute.otp_expires_at < new Date()
  ) {
    return sendError(res, 400, false, "OTP expired. Please request a new one.");
  }

  if (institute.otp_code !== otp) {
    return sendError(res, 400, false, "Invalid OTP.");
  }

  institute.otp_code = undefined;
  institute.otp_expires_at = undefined;
  await institute.save();

  return sendResponse(res, 200, true, "OTP verified successfully.", null);
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
  verifyByCode,
  downloadCourseData,
  getCourseLastUpdated,
  sendOtp,
  verifyOtp,
  getMe,
  updateMe,
  getPurchasedCourses,
  getDashboard,
  getPublic,
};
