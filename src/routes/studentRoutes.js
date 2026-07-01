const express = require("express");
const router = express.Router();

const upload = require("../middlewares/uploads");
const { validateSchema } = require("../middlewares/validate");
const protectStudent = require("../middlewares/protectStudent");
const protectInstitute = require("../middlewares/protectInstitute");
const protectSuperAdmin = require("../middlewares/protectSuperAdmin");
const authorizeRoles = require("../middlewares/authorizeRoles");

const {
  createStudentSchema,
  updateStudentSchema,
  updateMeSchema,
  loginSchema,
  purchaseCourseSchema,
  bulkAssignCoursesSchema,
} = require("../validation/studentValidation");

const {
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
  bulkAssignCourses,
  getAvailableCourses,
  purchaseCourse,
  getMyCourses,
} = require("../controller/studentController");

// ── Public ────────────────────────────────────────────────────────────────────
router.post("/login", validateSchema(loginSchema), login);

// ── Student (self) ────────────────────────────────────────────────────────────
router.get("/me", protectStudent, authorizeRoles("student"), getMe);
router.post("/logout", protectStudent, authorizeRoles("student"), logout);
router.put(
  "/me",
  protectStudent,
  authorizeRoles("student"),
  upload.single("studentPhoto"),
  validateSchema(updateMeSchema),
  updateMe,
);
router.get("/me/available-courses", protectStudent, authorizeRoles("student"), getAvailableCourses);
router.get("/me/courses", protectStudent, authorizeRoles("student"), getMyCourses);
router.post(
  "/me/purchase-course",
  protectStudent,
  authorizeRoles("student"),
  validateSchema(purchaseCourseSchema),
  purchaseCourse,
);
// ── College ───────────────────────────────────────────────────────────────────
router.post(
  "/",
  protectInstitute,
  authorizeRoles("institute"),
  upload.single("studentPhoto"),
  validateSchema(createStudentSchema),
  create,
);
router.get("/", protectInstitute, authorizeRoles("institute"), getAll);
router.get("/:id", protectInstitute, authorizeRoles("institute"), getOne);
router.put(
  "/:id",
  protectInstitute,
  authorizeRoles("institute"),
  upload.single("studentPhoto"),
  validateSchema(updateStudentSchema),
  update,
);
router.delete("/:id", protectInstitute, authorizeRoles("institute"), remove);
router.put("/:id/toggle-status", protectInstitute, authorizeRoles("institute"), toggleStatus);
router.post("/bulk-upload", protectInstitute, authorizeRoles("institute"), upload.single("studentExcel"), bulkUpload);
router.post("/bulk-assign-courses", protectInstitute, authorizeRoles("institute"), validateSchema(bulkAssignCoursesSchema), bulkAssignCourses);

module.exports = router;
