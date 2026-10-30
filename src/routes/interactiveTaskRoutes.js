const express = require("express");
const router = express.Router();

const protectInstitute = require("../middlewares/protectInstitute");
const protectStudent = require("../middlewares/protectStudent");
const upload = require("../middlewares/uploads");
const {
  list,
  getOne,
  create,
  update,
  remove,
  assignTask,
  getSubmissions,
  getStudentTasks,
  getStudentTaskById,
  evaluateSpeech,
  submitSpeech,
} = require("../controller/interactiveTaskController");

// ── Student Routes ────────────────────────────────────────────────────────────
// Must be registered before /:id parameter routes to avoid parameter collision
router.get("/student/course/:courseId", protectStudent, getStudentTasks);
router.get("/student/:id", protectStudent, getStudentTaskById);
router.post(
  "/student/:id/evaluate",
  protectStudent,
  upload.single("interactiveAudio"),
  evaluateSpeech,
);
router.post("/student/:id/submit", protectStudent, submitSpeech);

// ── Institute & Faculty Routes ────────────────────────────────────────────────
router.get("/", protectInstitute, list);
router.post("/", protectInstitute, create);
router.get("/:id", protectInstitute, getOne);
router.put("/:id", protectInstitute, update);
router.delete("/:id", protectInstitute, remove);
router.put("/:id/assign", protectInstitute, assignTask);
router.get("/:id/submissions", protectInstitute, getSubmissions);

module.exports = router;
