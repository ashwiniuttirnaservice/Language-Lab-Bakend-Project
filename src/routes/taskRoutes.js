const express = require("express");
const router = express.Router();

const upload = require("../middlewares/uploads");
const { validateSchema } = require("../middlewares/validate");
const protectInstitute = require("../middlewares/protectInstitute");
const protectStudent = require("../middlewares/protectStudent");
const authorizeRoles = require("../middlewares/authorizeRoles");

const {
  createTaskSchema,
  updateTaskSchema,
  updateSubmissionSchema,
  submitTaskSchema,
} = require("../validation/taskValidation");

const {
  create,
  getAll,
  getOne,
  update,
  getSubmissions,
  updateSubmission,
  remove,
  getMine,
  getOneMine,
  submitMine,
} = require("../controller/taskController");

// Parse questions/answers from JSON string → array (sent as a multipart
// field, same pattern as practicalRoutes.js's parseQuestions).
const parseQuestions = (req, _res, next) => {
  if (req.body?.questions && typeof req.body.questions === "string") {
    try {
      req.body.questions = JSON.parse(req.body.questions);
    } catch {
      /* leave as-is — will fail validation with a clear error */
    }
  }
  next();
};
const parseAnswers = (req, _res, next) => {
  if (req.body?.answers && typeof req.body.answers === "string") {
    try {
      req.body.answers = JSON.parse(req.body.answers);
    } catch {
      /* leave as-is — will fail validation with a clear error */
    }
  }
  next();
};

// ── Student Panel ──────────────────────────────────────────────────────────
// Registered before the blanket institute middleware below — distinct
// multi-segment paths ("/mine", ...) never collide with the institute
// "/:id" routes, so ordering relative to them doesn't matter either way.
router.get("/mine", protectStudent, authorizeRoles("student"), getMine);
router.get("/mine/:id", protectStudent, authorizeRoles("student"), getOneMine);
router.post(
  "/mine/:id/submit",
  protectStudent,
  authorizeRoles("student"),
  upload.single("taskSubmissionMedia"),
  parseAnswers,
  validateSchema(submitTaskSchema),
  submitMine,
);

router.use(protectInstitute, authorizeRoles("institute"));

router.post(
  "/",
  upload.single("taskMedia"),
  parseQuestions,
  validateSchema(createTaskSchema),
  create,
);
router.get("/", getAll);
router.get("/:id", getOne);
router.put(
  "/:id",
  upload.single("taskMedia"),
  parseQuestions,
  validateSchema(updateTaskSchema),
  update,
);
router.get("/:id/submissions", getSubmissions);
router.put(
  "/:id/submissions/:submissionId",
  validateSchema(updateSubmissionSchema),
  updateSubmission,
);
router.delete("/:id", remove);

module.exports = router;
