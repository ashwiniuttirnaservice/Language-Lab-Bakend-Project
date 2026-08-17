const express = require("express");
const router = express.Router();

const upload = require("../middlewares/uploads");
const protectStudent = require("../middlewares/protectStudent");
const authorizeRoles = require("../middlewares/authorizeRoles");
const { validateSchema } = require("../middlewares/validate");
const { createAssessmentSchema, updateAssessmentSchema } = require("../validation/assessmentValidation");
const { submitAnswersSchema, saveProgressSchema } = require("../validation/assessmentAttemptValidation");
const { create, getAll, getOne, update, remove, bulkUpload } = require("../controller/assessmentController");
const { submit, getResult, getMyAttempts, saveProgress, resume } = require("../controller/assessmentAttemptController");

// Bulk create from Excel — one row per question, grouped by subject_id + title.
// Must come before "/:id" so "bulk-upload" isn't parsed as an :id param.
router.post("/bulk-upload", upload.single("assessmentExcel"), bulkUpload);

// Student — submit/result/attempts flow (same as module/exercise, see
// exerciseAttemptController.js), plus save-progress/resume for a genuine
// mid-test resume (mirrors carrer-jupiter-backend's Result.resumeTest).
router.post(
  "/:id/submit",
  protectStudent,
  authorizeRoles("student"),
  validateSchema(submitAnswersSchema),
  submit,
);
router.post(
  "/:id/save-progress",
  protectStudent,
  authorizeRoles("student"),
  validateSchema(saveProgressSchema),
  saveProgress,
);
router.get("/:id/resume", protectStudent, authorizeRoles("student"), resume);
router.get("/:id/result", protectStudent, authorizeRoles("student"), getResult);
router.get("/:id/attempts", protectStudent, authorizeRoles("student"), getMyAttempts);

// GET /assessment?subject_id=xxx — all assessments under a subject
router.get("/", getAll);
router.get("/:id", getOne);
router.post("/", validateSchema(createAssessmentSchema), create);
router.put("/:id", validateSchema(updateAssessmentSchema), update);
router.delete("/:id", remove);

module.exports = router;
