const express = require("express");
const router = express.Router();

const upload = require("../middlewares/uploads");
const { validateSchema } = require("../middlewares/validate");
const protectSuperAdmin = require("../middlewares/protectSuperAdmin");
const protectEditor = require("../middlewares/protectEditor");
const authorizeRoles = require("../middlewares/authorizeRoles");

const {
  createEditorSchema,
  updateEditorSchema,
  updateMeSchema,
  loginSchema,
  changePasswordSchema,
} = require("../validation/editorValidation");

const {
  create,
  getAll,
  getOne,
  update,
  remove,
  toggleStatus,
  login,
  getMe,
  updateMe,
  changePassword,
} = require("../controller/editorController");

const {
  create: createCourse,
  getAll: getAllCourses,
  getOne: getOneCourse,
  update: updateCourse,
  remove: removeCourse,
} = require("../controller/courseController");

const editorGuard = [protectEditor, authorizeRoles("editor")];

router.post("/login", validateSchema(loginSchema), login);

router.get("/me", protectEditor, authorizeRoles("editor"), getMe);
router.put(
  "/me",
  protectEditor,
  authorizeRoles("editor"),
  upload.single("profilePhoto"),
  validateSchema(updateMeSchema),
  updateMe,
);
router.put(
  "/me/change-password",
  protectEditor,
  authorizeRoles("editor"),
  validateSchema(changePasswordSchema),
  changePassword,
);

// ── Course management (editor) ────────────────────────────────────────────────
router.post("/course", ...editorGuard, createCourse);
router.get("/course", ...editorGuard, getAllCourses);
router.get("/course/:id", ...editorGuard, getOneCourse);
router.put("/course/:id", ...editorGuard, updateCourse);
router.delete("/course/:id", ...editorGuard, removeCourse);

router.post(
  "/",
  protectSuperAdmin,
  authorizeRoles("super_admin"),
  upload.single("profilePhoto"),
  validateSchema(createEditorSchema),
  create,
);
router.get("/", protectSuperAdmin, authorizeRoles("super_admin"), getAll);
router.get("/:id", protectSuperAdmin, authorizeRoles("super_admin"), getOne);
router.put(
  "/:id",
  protectSuperAdmin,
  authorizeRoles("super_admin"),
  upload.single("profilePhoto"),
  validateSchema(updateEditorSchema),
  update,
);
router.delete("/:id", protectSuperAdmin, authorizeRoles("super_admin"), remove);
router.put(
  "/:id/toggle-status",
  protectSuperAdmin,
  authorizeRoles("super_admin"),
  toggleStatus,
);
module.exports = router;
