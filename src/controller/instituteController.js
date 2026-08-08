const crypto = require("crypto");
const bcrypt = require("bcryptjs");
const mongoose = require("mongoose");

const Institute = require("../models/Institute");
const Course = require("../models/Course");
const License = require("../models/License");
const Student = require("../models/Student");
const StudentProgress = require("../models/StudentProgress");
const Topic = require("../models/Topic");
const SubTopic = require("../models/SubTopic");
const VocabularyModule = require("../models/VocabularyModule");
const AudioModule = require("../models/AudioModule");
const VideoModule = require("../models/VideoModule");
const TextModule = require("../models/TextModule");
const ExerciseModule = require("../models/ExerciseModule");
const Task = require("../models/Task");
const TaskSubmission = require("../models/TaskSubmission");
const Practical = require("../models/Practical");
const PracticalSubmission = require("../models/PracticalSubmission");
const asyncHandler = require("../middlewares/asyncHandler");
const { sendResponse, sendError } = require("../utils/apiResponse");
const uploadToAws = require("../utils/awsUpload");
const emailService = require("../service/emailService");
const DownloadedAsset = require("../models/DownloadedAsset");
const {
  queueVideoDownloads,
  queueAudioDownloads,
  queueVocabularyAssetDownloads,
  queueSingleAssetDownload,
} = require("../service/videoDownloadService");
const { deterministicObjectId } = require("../utils/deterministicId");
const {
  isSyncEnabled,
  syncCourseFromMaster,
  syncCourseFromPublicDownload,
  syncInstituteFromMaster,
  syncInstituteFromPublicLogin,
} = require("../service/masterSyncService");
const logger = require("../utils/logger");

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
    // Issued upfront so it's ready whenever this institute sets up their
    // own local backend+database and needs to sync course content down
    // (see getSyncKey below + routes/syncRoutes.js) — never a DB credential.
    sync_api_key: crypto.randomBytes(24).toString("hex"),
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

  let institute = await Institute.findOne({ email }).select("+password");

  // First-ever local login on a standalone deployment: no local Institute
  // row exists yet for this email. Mirror it down from master and retry
  // once — every later login finds the now-local row and never takes this
  // path again. A wrong password still fails normally below; this only ever
  // creates/refreshes the row, it doesn't grant access by itself.
  if (!institute && isSyncEnabled()) {
    try {
      // Preferred path (see syncInstituteFromMaster's comment) — needs
      // GET /api/sync/institute + SYNC_API_KEY on the master deployment.
      await syncInstituteFromMaster();
      institute = await Institute.findOne({ email }).select("+password");
    } catch (error) {
      logger.error(`Institute sync-on-login failed for ${email}: ${error.message}`);
    }

    // Fallback — the master this backend points at doesn't have the sync
    // route deployed (404) on some deployments. Verify+mirror via the
    // always-available public login instead (see its comment).
    if (!institute) {
      try {
        await syncInstituteFromPublicLogin(email, password);
        institute = await Institute.findOne({ email }).select("+password");
      } catch (error) {
        logger.error(`Institute sync-on-login (public fallback) failed for ${email}: ${error.message}`);
      }
    }
  }

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
// Reads from the institute's own local database, not the master.
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

  if (institute?.logo) {
    // Cached opportunistically by downloadCourseData (queueSingleAssetDownload)
    // once a course download has run — falls back to null (AWS `logo` used
    // instead) until that file has actually landed on disk.
    const logoAsset = await DownloadedAsset.findOne({
      institute_id: req.institute._id,
      module_id: deterministicObjectId(`institute:${req.institute._id}:logo`),
    }).lean();
    institute.local_logo_url =
      logoAsset?.status === "completed"
        ? `/media/${req.institute._id}/${logoAsset.file_name}`
        : null;
  }

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
    { $project: { courses: 1, downloaded_course_ids: 1, _id: 0 } },
  ]);

  const downloadedSet = new Set(
    (institute?.downloaded_course_ids ?? []).map((id) => id.toString()),
  );
  const courses = (institute?.courses ?? []).map((course) => ({
    ...course,
    is_downloaded: downloadedSet.has(course._id.toString()),
  }));

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
    "institute_name course_id downloaded_course_ids license_ids license_count max_students createdAt",
  );
  if (!institute) return sendError(res, 404, false, "Institute not found.");

  const now = new Date();
  const weekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
  const fiveMinutesAgo = new Date(now.getTime() - 5 * 60 * 1000);

  const [
    totalStudents,
    newStudentsThisWeek,
    studentStatusCounts,
    coursesLicensedCount,
    licenses,
    progressStats,
    onlineCount,
    activeStudents,
  ] = await Promise.all([
    Student.countDocuments({ institute_id: instituteId }),
    Student.countDocuments({ institute_id: instituteId, createdAt: { $gte: weekAgo } }),
    Student.aggregate([
      { $match: { institute_id: instituteId } },
      { $group: { _id: "$status", count: { $sum: 1 } } },
    ]),
    Course.countDocuments({
      _id: { $in: institute.downloaded_course_ids },
      is_active: true,
    }),
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
    Student.countDocuments({
      institute_id: instituteId,
      last_seen_at: { $gte: fiveMinutesAgo },
    }),
    Student.find({
      institute_id: instituteId,
      last_seen_at: { $gte: fiveMinutesAgo },
    })
      .sort({ last_login: -1 })
      .limit(8)
      .select("full_name last_login")
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

  // ── Assignment completion — Task + Practical, institute-wide ─────
  const [tasksList, practicalsList, enrollmentRows] = await Promise.all([
    Task.find({ institute_id: instituteId, is_deleted: false })
      .select("target course_id student_ids")
      .lean(),
    Practical.find({ institute_id: instituteId, is_deleted: false })
      .select("course_id")
      .lean(),
    Student.aggregate([
      { $match: { institute_id: instituteId } },
      { $unwind: "$purchased_courses" },
      { $group: { _id: "$purchased_courses", count: { $sum: 1 } } },
    ]),
  ]);
  const enrollmentByCourse = {};
  enrollmentRows.forEach((row) => {
    enrollmentByCourse[row._id.toString()] = row.count;
  });

  const taskAssigned = tasksList.reduce(
    (sum, t) =>
      sum +
      (t.target === "selected"
        ? (t.student_ids || []).length
        : enrollmentByCourse[t.course_id?.toString()] || 0),
    0,
  );
  const practicalAssigned = practicalsList.reduce(
    (sum, p) => sum + (enrollmentByCourse[p.course_id?.toString()] || 0),
    0,
  );

  const [taskCompleted, practicalCompleted] = await Promise.all([
    TaskSubmission.countDocuments({
      task_id: { $in: tasksList.map((t) => t._id) },
      status: { $in: ["submitted", "late", "reviewed"] },
    }),
    PracticalSubmission.countDocuments({
      practical_id: { $in: practicalsList.map((p) => p._id) },
      status: { $in: ["submitted", "reviewed"] },
    }),
  ]);

  const assignmentTotal = taskAssigned + practicalAssigned;
  const assignmentCompleted = taskCompleted + practicalCompleted;

  // ── Recent activity feed — currently logged-in students ──────────
  const recentActivity = activeStudents.map((s) => ({
    student_id: s._id,
    full_name: s.full_name,
    duration_minutes: s.last_login
      ? Math.max(0, Math.round((now.getTime() - new Date(s.last_login).getTime()) / 60000))
      : null,
  }));

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
    login_status_breakdown: {
      online: onlineCount,
      offline: Math.max(totalStudents - onlineCount, 0),
    },
    assignment_completion: {
      completed: assignmentCompleted,
      pending: Math.max(assignmentTotal - assignmentCompleted, 0),
    },
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

// GET /institute/public
// No auth — lightweight list of active institutes for the student-login
// "Select License" dropdown (a student's license pool lives on their institute,
// so choosing the institute is how they pick their license). Only institutes
// that are actually ready are listed: has at least one license key, AND has
// logged into /config and downloaded at least one course — a licensed
// institute that never pulled course content isn't usable yet either.
// Optional ?search= filters by institute_name.
const getPublicList = asyncHandler(async (req, res) => {
  const filter = {
    is_active: true,
    downloaded_course_ids: { $exists: true, $not: { $size: 0 } },
  };

  if (req.query.search) {
    filter.institute_name = { $regex: req.query.search.trim(), $options: "i" };
  }

  const institutes = await Institute.find(filter, "institute_name institute_code logo")
    .sort({ institute_name: 1 })
    .lean();

  // Matched by institute_id directly rather than the stale license_count
  // counter / license_ids array (only ever maintained by generateBatch) —
  // otherwise an institute with real, active licenses created another way
  // would silently vanish from the student login dropdown entirely.
  const activeLicenses = await License.find(
    { institute_id: { $in: institutes.map((i) => i._id) }, status: "active" },
    "institute_id license_code",
  ).lean();

  const codesByInstitute = {};
  activeLicenses.forEach((l) => {
    const key = l.institute_id.toString();
    (codesByInstitute[key] ||= []).push(l.license_code);
  });

  const result = institutes
    .filter((inst) => (codesByInstitute[inst._id.toString()] || []).length > 0)
    .map((inst) => ({
      ...inst,
      license_codes: codesByInstitute[inst._id.toString()] || [],
    }));

  return sendResponse(res, 200, true, "Institutes fetched successfully.", result);
});

// GET /institute/public/:id
// No auth — safe, non-sensitive fields for public display (e.g. landing page),
// plus a lightweight list of the institute's offered courses (not the full
// topic/module tree — that stays behind the institute-only download route).
const getPublic = asyncHandler(async (req, res) => {
  if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
    return sendError(res, 404, false, "Institute not found.");
  }

  const institute = await Institute.findOne(
    { _id: req.params.id, is_active: true },
    "institute_name institute_code logo website address.state address.city address.nearbyLandmarks course_id",
  )
    .populate({
      path: "course_id",
      match: { is_active: true },
      select: "course_name description level language duration_days thumbnail_url",
    })
    .lean();

  if (!institute) return sendError(res, 404, false, "Institute not found.");

  const { course_id: courses, ...instituteFields } = institute;

  return sendResponse(res, 200, true, "Institute fetched successfully.", {
    ...instituteFields,
    courses: courses || [],
  });
});

// GET /institute/me/sync-key
// Reveals this institute's own master-sync API key (crypto.randomBytes hex
// string, generated at Institute creation) so an admin can copy it into
// their own local backend's .env (SYNC_API_KEY) — see routes/syncRoutes.js
// for where it's actually used. Institutes created before this field
// existed won't have one yet, so it's lazily generated here on first call
// instead of requiring a separate backfill script.
const getSyncKey = asyncHandler(async (req, res) => {
  let institute = await Institute.findById(req.institute._id).select("+sync_api_key");
  if (!institute) return sendError(res, 404, false, "Institute not found.");

  if (!institute.sync_api_key) {
    institute.sync_api_key = crypto.randomBytes(24).toString("hex");
    await institute.save();
  }

  return sendResponse(res, 200, true, "Sync key fetched.", {
    sync_api_key: institute.sync_api_key,
  });
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

  // On a standalone local-database deployment, pull this course's content
  // down from the master server first and mirror it into our own DB — the
  // rest of this function then reads it back out exactly like the single
  // shared-database deployment does, unchanged below this block.
  //
  // Sync is best-effort, NOT required to succeed: if this course was already
  // downloaded before and is sitting in the local DB, a sync failure (most
  // commonly: no internet at all right now — ENOTFOUND/ECONNREFUSED/timeout
  // reaching master) must NOT block serving that already-cached copy. That's
  // the entire point of "offline server" — only a course that has NEVER been
  // successfully pulled before has nothing to fall back to, and THAT case
  // still needs to fail loudly instead of silently returning empty content.
  if (isSyncEnabled()) {
    try {
      // Preferred path — needs GET /api/sync/course/:id + SYNC_API_KEY on
      // the master deployment.
      await syncCourseFromMaster(courseId, req.institute._id);
    } catch (error) {
      // Fallback — that route isn't deployed on some master deployments
      // (404). Pull the same content via the always-available public
      // download endpoint instead, using the master-issued institute token
      // the frontend forwards in x-master-token (see courseApi.downloadCourse).
      const masterToken = req.headers["x-master-token"];
      let synced = false;

      if (masterToken) {
        try {
          await syncCourseFromPublicDownload(courseId, req.institute._id, masterToken);
          synced = true;
        } catch (fallbackError) {
          logger.error(`Course sync fallback failed for ${courseId}: ${fallbackError.message}`);
        }
      }

      if (!synced) {
        const alreadyLocal = await Course.exists({ _id: courseId });
        if (!alreadyLocal) {
          const message = error.response?.data?.message || error.message;
          return sendError(res, 502, false, `Failed to sync course from master: ${message}`);
        }
        logger.error(
          `Course sync failed for ${courseId}, serving already-cached local copy: ${error.message}`,
        );
      }
    }
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

  // Local media caching: kick off (or resume) background downloads of every
  // video/audio module's file, every vocabulary word's audio/image, and this
  // course's thumbnail to this server's disk, so the whole course is usable
  // with no internet once downloaded — not just video/audio playback.
  // Doesn't block the response below — see queueVideoDownloads() for why.
  queueVideoDownloads(req.institute._id, course._id, video);
  queueAudioDownloads(req.institute._id, course._id, audio);
  queueVocabularyAssetDownloads(req.institute._id, course._id, vocabulary);
  queueSingleAssetDownload(req.institute._id, course._id, {
    key: `course:${course._id}:thumbnail`,
    module_type: "course_thumbnail",
    title: `${course.course_name} (thumbnail)`,
    source_url: course.thumbnail_url,
  });
  // Opportunistic — this institute's logo isn't part of this response, but
  // GET /institute/me returns it (see getMe below), so cache it here too
  // while we already have the institute's own record in hand.
  queueSingleAssetDownload(req.institute._id, course._id, {
    key: `institute:${req.institute._id}:logo`,
    module_type: "institute_logo",
    title: "Institute logo",
    source_url: req.institute.logo,
  });

  // Every id that might have a DownloadedAsset row: real module ids
  // (video/audio) plus the synthetic ones for vocab words + the thumbnail
  // (same derivation queueVocabularyAssetDownloads/queueSingleAssetDownload
  // used above, so lookups line up with whatever got queued).
  const wordAssetIdByWord = new Map(); // "moduleId:index:audio|image" -> id
  for (const m of vocabulary) {
    (m.words || []).forEach((word, index) => {
      if (word.audio_url) {
        wordAssetIdByWord.set(
          `${m._id}:${index}:audio`,
          deterministicObjectId(`${m._id}:word:${index}:audio`),
        );
      }
      if (word.image_url) {
        wordAssetIdByWord.set(
          `${m._id}:${index}:image`,
          deterministicObjectId(`${m._id}:word:${index}:image`),
        );
      }
    });
  }
  const thumbnailAssetId = deterministicObjectId(`course:${course._id}:thumbnail`);

  const allAssetIds = [
    ...video.map((m) => m._id),
    ...audio.map((m) => m._id),
    ...wordAssetIdByWord.values(),
    thumbnailAssetId,
  ];

  const mediaAssets = await DownloadedAsset.find({
    institute_id: req.institute._id,
    module_id: { $in: allAssetIds },
  }).lean();
  const assetByModuleId = new Map(mediaAssets.map((a) => [a.module_id.toString(), a]));

  const localUrlIfReady = (asset) =>
    asset?.status === "completed" ? `/media/${req.institute._id}/${asset.file_name}` : null;

  for (const m of modules) {
    if (m.module_type !== "video" && m.module_type !== "audio") continue;
    const asset = assetByModuleId.get(m._id.toString());
    m[m.module_type] = {
      ...m[m.module_type],
      download_status: asset?.status || "pending",
      // Local, offline-playable URL once the file has actually landed on
      // disk; frontend falls back to the AWS `url` until this is set.
      local_url: localUrlIfReady(asset),
    };
  }

  // Same treatment for each vocabulary word's audio/image.
  for (const m of vocabulary) {
    m.words = (m.words || []).map((word, index) => {
      const audioAsset = assetByModuleId.get(
        wordAssetIdByWord.get(`${m._id}:${index}:audio`)?.toString(),
      );
      const imageAsset = assetByModuleId.get(
        wordAssetIdByWord.get(`${m._id}:${index}:image`)?.toString(),
      );
      return {
        ...word,
        audio_download_status: word.audio_url ? audioAsset?.status || "pending" : undefined,
        local_audio_url: word.audio_url ? localUrlIfReady(audioAsset) : undefined,
        image_download_status: word.image_url ? imageAsset?.status || "pending" : undefined,
        local_image_url: word.image_url ? localUrlIfReady(imageAsset) : undefined,
      };
    });
  }

  // And the course thumbnail.
  const thumbnailAsset = assetByModuleId.get(thumbnailAssetId.toString());
  course.local_thumbnail_url = localUrlIfReady(thumbnailAsset);

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

  // Snapshot this course's current topic_ids — students only see topics that
  // were part of the course as of this pull. A topic added to the course
  // later stays hidden from students until the institute downloads/updates
  // this course again, refreshing the snapshot below.
  await Institute.updateOne(
    { _id: req.institute._id },
    { $pull: { downloaded_topic_snapshot: { course_id: course._id } } },
  );
  await Institute.updateOne(
    { _id: req.institute._id },
    { $push: { downloaded_topic_snapshot: { course_id: course._id, topic_ids: topicIds } } },
  );

  return sendResponse(res, 200, true, "Course data pulled successfully.", {
    course,
    topics: topicsWithContent,
    last_updated: lastUpdated,
  });
});

// GET /institute/me/courses/:courseId/download-status
// Lightweight poll target for the frontend while background video downloads
// (kicked off by downloadCourseData above) are still running — lets the UI
// show "downloading video X of Y" and switch each player over to the local
// /media URL the moment its file lands on disk, without re-pulling the
// whole course payload.
const getCourseDownloadStatus = asyncHandler(async (req, res) => {
  const { courseId } = req.params;
  if (!mongoose.Types.ObjectId.isValid(courseId)) {
    return sendError(res, 404, false, "Course not found.");
  }

  const assets = await DownloadedAsset.find({
    institute_id: req.institute._id,
    course_id: courseId,
  })
    .select("module_id title status size_bytes downloaded_bytes total_bytes error_message updatedAt")
    .lean();

  const summary = assets.reduce(
    (acc, a) => {
      acc[a.status] = (acc[a.status] || 0) + 1;
      return acc;
    },
    { pending: 0, downloading: 0, completed: 0, failed: 0 },
  );

  return sendResponse(res, 200, true, "Download status fetched.", {
    total: assets.length,
    summary,
    all_completed: assets.length > 0 && summary.completed === assets.length,
    assets,
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
// On a standalone local deployment, the very first thing an institute does
// is this /config flow — institute_code lookup, then OTP, then finally
// email/password login. All three steps below query by institute_code
// against whatever DB this backend is connected to, which is empty on a
// fresh local deployment (nobody's logged in yet to trigger the sync
// login() does). This mirrors the record down from master (same mechanism
// login() uses on its own not-found path) the first time any of them can't
// find it locally, so the whole /config → OTP → login sequence works
// before any separate manual sync step — exactly like it already does,
// unmodified, on the shared-database deployment.
const findInstituteByCodeWithSync = async (code) => {
  let institute = await Institute.findOne({ institute_code: code, is_active: true });
  if (!institute && isSyncEnabled()) {
    try {
      await syncInstituteFromMaster();
      institute = await Institute.findOne({ institute_code: code, is_active: true });
    } catch (error) {
      logger.error(`Institute sync-on-config failed for code ${code}: ${error.message}`);
    }
  }
  return institute;
};

const verifyByCode = asyncHandler(async (req, res) => {
  const code = req.params.code?.trim().toUpperCase();

  const found = await findInstituteByCodeWithSync(code);
  if (!found) return sendError(res, 404, false, "Invalid institute code.");

  const institute = await Institute.findById(
    found._id,
    "institute_name institute_code logo",
  ).lean();
  return sendResponse(res, 200, true, "Institute code verified.", institute);
});

// POST /institute/send-otp
// No auth — sends a 6-digit OTP to the institute's registered email so the
// /config flow can verify the institute before the email/password login step.
const sendOtp = asyncHandler(async (req, res) => {
  const code = req.body.institute_code?.trim().toUpperCase();

  const institute = await findInstituteByCodeWithSync(code);
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

  const found = await findInstituteByCodeWithSync(code);
  if (!found) return sendError(res, 404, false, "Invalid institute code.");

  const institute = await Institute.findById(found._id).select("+otp_code +otp_expires_at");

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

// GET /institute/active-students-count
// Counts students of this institute whose last_seen_at heartbeat landed
// within the last 5 minutes — powers the dashboard's "Active Now" tile.
const getActiveStudentsCount = asyncHandler(async (req, res) => {
  const fiveMinutesAgo = new Date(Date.now() - 5 * 60 * 1000);

  const count = await Student.countDocuments({
    institute_id: req.institute._id,
    last_seen_at: { $gte: fiveMinutesAgo },
  });

  return sendResponse(res, 200, true, "Active students count fetched successfully.", {
    active_count: count,
  });
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
  getCourseDownloadStatus,
  getSyncKey,
  getCourseLastUpdated,
  sendOtp,
  verifyOtp,
  getMe,
  updateMe,
  getPurchasedCourses,
  getDashboard,
  getPublic,
  getPublicList,
  getActiveStudentsCount,
};
