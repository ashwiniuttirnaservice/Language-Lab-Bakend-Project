const express = require("express");
const router = express.Router();

const upload = require("../middlewares/uploads");
const { validateSchema } = require("../middlewares/validate");
const protectSuperAdmin = require("../middlewares/protectSuperAdmin");
const protectInstitute = require("../middlewares/protectInstitute");
const authorizeRoles = require("../middlewares/authorizeRoles");

const {
  createInstituteSchema,
  updateInstituteSchema,
  assignLicenseSchema,
  loginSchema,
  updateMeSchema,
} = require("../validation/instituteValidation");

const {
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
  getPublicList,
  getActiveStudentsCount,
  verifyByCode,
  downloadCourseData,
  downloadSubjectsData,
  getCourseDownloadStatus,
  getSyncKey,
  getCourseLastUpdated,
  getCourseSyncStatus,
  sendOtp,
  verifyOtp,
} = require("../controller/instituteController");

const { getByInstitute } = require("../controller/licenseBatchController");

const {
  getTeachers,
  createTeacher,
  updateTeacher,
  deleteTeacher,
  toggleTeacherStatus,
  resetTeacherPassword,
} = require("../controller/teacherController");

const studentLearningAccessRoutes = require("./studentLearningAccessRoutes");

const {
  getTopicDetails,
  getExerciseReport,
  getPracticalReport,
  getTaskReport,
} = require("../controller/studentReportController");

const {
  getActivityLog,
  exportActivityLog,
  getProgressReport,
  getStudentActivitySummary,
  getStudentActivityHistory,
} = require("../controller/activityReportController");

// Parse address from JSON string → object (sent as multipart field)
const parseAddress = (req, _res, next) => {
  if (req.body?.address && typeof req.body.address === "string") {
    try {
      req.body.address = JSON.parse(req.body.address);
    } catch {
      /* leave as-is */
    }
  }
  next();
};

const {
  getAll: getAllCourses,
  getOne: getOneCourse,
} = require("../controller/courseController");

// ── Public ────────────────────────────────────────────────────────────────────
router.post("/login", validateSchema(loginSchema), login);
router.get("/public", getPublicList);
router.get("/public/:id", getPublic);
router.get("/verify-code/:code", verifyByCode);
router.post("/send-otp", sendOtp);
router.post("/verify-otp", verifyOtp);

// ── Courses for select/dropdown (SuperAdmin token) ────────────────────────────
router.get(
  "/courses/list",
  protectSuperAdmin,
  authorizeRoles("super_admin"),
  getAllCourses,
);
router.get(
  "/courses/:id",
  protectSuperAdmin,
  authorizeRoles("super_admin"),
  getOneCourse,
);

// ── Institute & Faculty (self) ────────────────────────────────────────────────
router.post(
  "/logout",
  protectInstitute,
  authorizeRoles("institute", "faculty"),
  logout,
);
router.get("/me", protectInstitute, authorizeRoles("institute", "faculty"), getMe);
router.get(
  "/me/dashboard",
  protectInstitute,
  authorizeRoles("institute", "faculty"),
  getDashboard,
);
router.get(
  "/active-students-count",
  protectInstitute,
  authorizeRoles("institute", "faculty"),
  getActiveStudentsCount,
);
router.get(
  "/me/courses",
  protectInstitute,
  authorizeRoles("institute", "faculty"),
  getPurchasedCourses,
);
router.get(
  "/me/courses/:courseId/download",
  protectInstitute,
  authorizeRoles("institute"),
  downloadCourseData,
);
// Standalone Subjects/Assessments sync — not tied to any course, see
// instituteController.downloadSubjectsData.
router.get(
  "/me/subjects/download",
  protectInstitute,
  authorizeRoles("institute"),
  downloadSubjectsData,
);
router.get(
  "/me/courses/:courseId/download-status",
  protectInstitute,
  authorizeRoles("institute", "faculty"),
  getCourseDownloadStatus,
);
router.get(
  "/me/sync-key",
  protectInstitute,
  authorizeRoles("institute"),
  getSyncKey,
);
router.get(
  "/me/courses/:courseId/last-updated",
  protectInstitute,
  authorizeRoles("institute"),
  getCourseLastUpdated,
);
router.get(
  "/me/courses/:courseId/sync-status",
  protectInstitute,
  authorizeRoles("institute"),
  getCourseSyncStatus,
);
router.get(
  "/me/licenses",
  protectInstitute,
  authorizeRoles("institute"),
  getByInstitute,
);
router.put(
  "/me",
  protectInstitute,
  authorizeRoles("institute"),
  upload.single("logo"),
  validateSchema(updateMeSchema),
  updateMe,
);

// ── Institute & Faculty: per-student reports (Student Statistics tabs) ────────
router.get(
  "/students/:id/topic-details",
  protectInstitute,
  authorizeRoles("institute", "faculty"),
  getTopicDetails,
);
router.get(
  "/students/:id/exercise-report",
  protectInstitute,
  authorizeRoles("institute", "faculty"),
  getExerciseReport,
);
router.get(
  "/students/:id/practical-report",
  protectInstitute,
  authorizeRoles("institute", "faculty"),
  getPracticalReport,
);
router.get(
  "/students/:id/task-report",
  protectInstitute,
  authorizeRoles("institute", "faculty"),
  getTaskReport,
);
router.get(
  "/students/:id/progress-report",
  protectInstitute,
  authorizeRoles("institute", "faculty"),
  getProgressReport,
);
router.get(
  "/students/:id/activity-summary",
  protectInstitute,
  authorizeRoles("institute", "faculty"),
  getStudentActivitySummary,
);
router.get(
  "/students/:id/activity-history",
  protectInstitute,
  authorizeRoles("institute", "faculty"),
  getStudentActivityHistory,
);

// ── Institute: Student Learning Access (course/topic/subtopic → segment+year) ─
router.use("/student-learning-access", studentLearningAccessRoutes);

// ── Institute & Faculty: activity log (Student Activity Log) ──────────────────
router.get(
  "/activity-log/export",
  protectInstitute,
  authorizeRoles("institute", "faculty"),
  exportActivityLog,
);
router.get(
  "/activity-log",
  protectInstitute,
  authorizeRoles("institute", "faculty"),
  getActivityLog,
);

// ── Institute: Faculty / Teacher Management ──────────────────────────────────
router.get(
  "/teachers",
  protectInstitute,
  authorizeRoles("institute"),
  getTeachers,
);
router.post(
  "/teachers",
  protectInstitute,
  authorizeRoles("institute"),
  createTeacher,
);
router.put(
  "/teachers/:id",
  protectInstitute,
  authorizeRoles("institute"),
  updateTeacher,
);
router.delete(
  "/teachers/:id",
  protectInstitute,
  authorizeRoles("institute"),
  deleteTeacher,
);
router.patch(
  "/teachers/:id/toggle-status",
  protectInstitute,
  authorizeRoles("institute"),
  toggleTeacherStatus,
);
router.post(
  "/teachers/:id/reset-password",
  protectInstitute,
  authorizeRoles("institute"),
  resetTeacherPassword,
);

// ── Super Admin ───────────────────────────────────────────────────────────────
router.post(
  "/",
  protectSuperAdmin,
  authorizeRoles("super_admin"),
  upload.single("logo"),
  parseAddress,
  validateSchema(createInstituteSchema),
  create,
);
router.get("/", protectSuperAdmin, authorizeRoles("super_admin"), getAll);
router.get("/:id", protectSuperAdmin, authorizeRoles("super_admin"), getOne);
router.put(
  "/:id",
  protectSuperAdmin,
  authorizeRoles("super_admin"),
  upload.single("logo"),
  parseAddress,
  validateSchema(updateInstituteSchema),
  update,
);
router.delete("/:id", protectSuperAdmin, authorizeRoles("super_admin"), remove);
router.put(
  "/:id/toggle-status",
  protectSuperAdmin,
  authorizeRoles("super_admin"),
  toggleStatus,
);
router.put(
  "/:id/assign-license",
  protectSuperAdmin,
  authorizeRoles("super_admin"),
  validateSchema(assignLicenseSchema),
  assignLicense,
);
router.put(
  "/:id/resend-credentials",
  protectSuperAdmin,
  authorizeRoles("super_admin"),
  resendCredentials,
);

module.exports = router;
