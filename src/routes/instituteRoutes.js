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
  verifyByCode,
  downloadCourseData,
  getCourseLastUpdated,
  sendOtp,
  verifyOtp,
} = require("../controller/instituteController");

const { getByInstitute } = require("../controller/licenseBatchController");

// Parse address from JSON string → object (sent as multipart field)
const parseAddress = (req, _res, next) => {
  if (req.body?.address && typeof req.body.address === "string") {
    try { req.body.address = JSON.parse(req.body.address); } catch { /* leave as-is */ }
  }
  next();
};

const {
  getAll: getAllCourses,
  getOne: getOneCourse,
} = require("../controller/courseController");

// ── Public ────────────────────────────────────────────────────────────────────
router.post("/login", validateSchema(loginSchema), login);
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

// ── Institute (self) ──────────────────────────────────────────────────────────
router.post("/logout", protectInstitute, authorizeRoles("institute"), logout);
router.get("/me", protectInstitute, authorizeRoles("institute"), getMe);
router.get("/me/dashboard", protectInstitute, authorizeRoles("institute"), getDashboard);
router.get("/me/courses", protectInstitute, authorizeRoles("institute"), getPurchasedCourses);
router.get(
  "/me/courses/:courseId/download",
  protectInstitute,
  authorizeRoles("institute"),
  downloadCourseData,
);
router.get(
  "/me/courses/:courseId/last-updated",
  protectInstitute,
  authorizeRoles("institute"),
  getCourseLastUpdated,
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
