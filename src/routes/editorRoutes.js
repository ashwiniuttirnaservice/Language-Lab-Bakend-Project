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
  assignInstituteSchema,
  changePasswordSchema,
} = require("../validation/editorValidation");

const {
  create,
  getAll,
  getOne,
  update,
  remove,
  toggleStatus,
  assignInstitute,
  login,
  getMe,
  updateMe,
  changePassword,
} = require("../controller/editorController");

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
router.put(
  "/:id/assign-institute",
  protectSuperAdmin,
  authorizeRoles("super_admin"),
  validateSchema(assignInstituteSchema),
  assignInstitute,
);

module.exports = router;
