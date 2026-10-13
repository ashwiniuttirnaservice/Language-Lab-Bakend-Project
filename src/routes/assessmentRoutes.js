const express = require("express");
const router = express.Router();

const upload = require("../middlewares/uploads");
const protectStudent = require("../middlewares/protectStudent");
const optionalAuth = require("../middlewares/optionalAuth");
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

// GET /assessment?subject_id=xxx — all assessments under a subject.
// optionalAuth sets req.student when a student token is present (without
// blocking admin-panel/anonymous callers) so getAll/getOne can filter
// hidden (userType "0") assessments out of the student-facing view only.
router.get("/", optionalAuth, getAll);
router.get("/:id", optionalAuth, getOne);
router.post("/", validateSchema(createAssessmentSchema), create);
router.put("/:id", validateSchema(updateAssessmentSchema), update);
router.delete("/:id", remove);

module.exports = router;
