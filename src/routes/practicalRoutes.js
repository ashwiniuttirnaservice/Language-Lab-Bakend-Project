const express = require("express");
const router = express.Router();

const upload = require("../middlewares/uploads");
const { validateSchema } = require("../middlewares/validate");
const protectInstitute = require("../middlewares/protectInstitute");
const protectStudent = require("../middlewares/protectStudent");
const authorizeRoles = require("../middlewares/authorizeRoles");

const {
  createPracticalSchema,
  updatePracticalSchema,
  submitPracticalSchema,
  gradeSubmissionSchema,
  assignPracticalSchema,
} = require("../validation/practicalValidation");

const {
  create,
  getAll,
  getOne,
  update,
  remove,
  assign,
  getDepartments,
  getSubmissions,
  gradeSubmission,
  getMine,
  getOneMine,
  submitMine,
} = require("../controller/practicalController");

// Parse questions/answers from JSON string → array (sent as a multipart
// field, same pattern as instituteRoutes.js's parseAddress).
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
// Registered before the blanket institute middleware below so these paths
// never hit protectInstitute — distinct multi-segment paths ("/mine", ...)
// keep them from ever colliding with the institute "/:id" routes.
router.get("/mine", protectStudent, authorizeRoles("student"), getMine);
router.get("/mine/:id", protectStudent, authorizeRoles("student"), getOneMine);
router.post(
  "/mine/:id/submit",
  protectStudent,
  authorizeRoles("student"),
  // upload.any() — accepts both the whole-manual "practicalSubmissionAttachment"
  // (solution_type: "file" at the manual level) and any number of
  // "question_file_{questionId}" fields (per-question file-type answers).
  upload.any(),
  parseAnswers,
  validateSchema(submitPracticalSchema),
  submitMine,
);

router.use(protectInstitute, authorizeRoles("institute"));

router.post(
  "/",
  upload.single("practicalAttachment"),
  parseQuestions,
  validateSchema(createPracticalSchema),
  create,
);
// Registered before "/:id" so the literal path "departments" never gets
// swallowed by the "/:id" param route below.
router.get("/departments", getDepartments);
router.get("/", getAll);
router.get("/:id", getOne);
router.put(
  "/:id",
  upload.single("practicalAttachment"),
  parseQuestions,
  validateSchema(updatePracticalSchema),
  update,
);
router.put("/:id/assign", validateSchema(assignPracticalSchema), assign);
router.get("/:id/submissions", getSubmissions);
router.put(
  "/:id/submissions/:submissionId",
  validateSchema(gradeSubmissionSchema),
  gradeSubmission,
);
router.delete("/:id", remove);

module.exports = router;
