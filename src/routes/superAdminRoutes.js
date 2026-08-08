const express = require("express");
const router = express.Router();

const upload = require("../middlewares/uploads");
const { validateSchema } = require("../middlewares/validate");
const {
  registerSchema,
  loginSchema,
  updateProfileSchema,
  changePasswordSchema,
} = require("../validation/superAdminValidation");

const {
  register,
  login,
  getProfile,
  updateProfile,
  changePassword,
  getDashboard,
} = require("../controller/superAdminController");

const {
  create: createCourse,
  getAll: getAllCourses,
  getOne: getOneCourse,
  update: updateCourse,
  remove: removeCourse,
  getCourseModuleCount,
} = require("../controller/courseController");

const {
  generateBatch,
  getByInstitute,
  resetSeats,
} = require("../controller/licenseBatchController");

const {
  getAllForAdmin: getAllStudents,
} = require("../controller/studentController");

const protectSuperAdmin = require("../middlewares/protectSuperAdmin");
const authorizeRoles = require("../middlewares/authorizeRoles");

const guard = [protectSuperAdmin, authorizeRoles("super_admin")];

// ── Public ────────────────────────────────────────────────────────────────────
router.post(
  "/register",
  upload.single("profileImage"),
  validateSchema(registerSchema),
  register,
);
router.post("/login", validateSchema(loginSchema), login);

// ── Dashboard ─────────────────────────────────────────────────────────────────
router.get("/dashboard", ...guard, getDashboard);

// ── SuperAdmin profile ────────────────────────────────────────────────────────
router.get("/profile", ...guard, getProfile);
router.put(
  "/profile",
  ...guard,
  upload.single("profileImage"),
  validateSchema(updateProfileSchema),
  updateProfile,
);
router.put(
  "/change-password",
  ...guard,
  validateSchema(changePasswordSchema),
  changePassword,
);

// ── Course management ─────────────────────────────────────────────────────────
router.post("/course", ...guard, createCourse);
router.get("/course", getAllCourses);
router.get("/course/:id/module-count", getCourseModuleCount);
router.get("/course/:id", getOneCourse);
router.put("/course/:id", updateCourse);
router.delete("/course/:id", removeCourse);

// ── Students (super admin view) ───────────────────────────────────────────────
router.get("/students", ...guard, getAllStudents);

// ── Institute license batch generation ───────────────────────────────────────
router.put("/institute/:id/license", ...guard, generateBatch);
router.get("/institute/:id/licenses", ...guard, getByInstitute);
router.post("/institute/:id/reset-seats", ...guard, resetSeats);

module.exports = router;
