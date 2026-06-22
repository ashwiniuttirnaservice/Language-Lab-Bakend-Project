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
  login,
  logout,
  getMe,
  updateMe,
} = require("../controller/instituteController");

const {
  getAll: getAllCourses,
  getOne: getOneCourse,
} = require("../controller/courseController");


// ── Public ────────────────────────────────────────────────────────────────────
router.post("/login", validateSchema(loginSchema), login);

// ── Courses for select/dropdown (SuperAdmin token) ────────────────────────────
router.get("/courses/list", protectSuperAdmin, authorizeRoles("super_admin"), getAllCourses);
router.get("/courses/:id", protectSuperAdmin, authorizeRoles("super_admin"), getOneCourse);

// ── Institute (self) ──────────────────────────────────────────────────────────
router.post("/logout", protectInstitute, authorizeRoles("institute"), logout);
router.get("/me", protectInstitute, authorizeRoles("institute"), getMe);
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
  validateSchema(updateInstituteSchema),
  update,
);
router.delete("/:id", protectSuperAdmin, authorizeRoles("super_admin"), remove);
router.put("/:id/toggle-status", protectSuperAdmin, authorizeRoles("super_admin"), toggleStatus);
router.put(
  "/:id/assign-license",
  protectSuperAdmin,
  authorizeRoles("super_admin"),
  validateSchema(assignLicenseSchema),
  assignLicense,
);

module.exports = router;
