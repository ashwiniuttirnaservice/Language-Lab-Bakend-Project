const ExerciseModule = require("../models/ExerciseModule");
const StudentModuleAttempt = require("../models/StudentModuleAttempt");
const StudentProgress = require("../models/StudentProgress");
const asyncHandler = require("../middlewares/asyncHandler");
const { sendResponse, sendError } = require("../utils/apiResponse");

const PASS_THRESHOLD_PERCENT = 40;

const normalize = (str) => String(str ?? "").trim().toLowerCase();

// POST /module/exercise/:id/submit
const submit = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const { answers, time_spent_sec } = req.body;

  const exercise = await ExerciseModule.findById(id);
  if (!exercise || !exercise.is_active)
    return sendError(res, 404, false, "Exercise not found.");

  const attemptCount = await StudentModuleAttempt.countDocuments({
    student_id: req.student._id,
    module_id: id,
  });

  if (attemptCount >= exercise.max_attempts)
    return sendError(
      res,
      403,
      false,
      `Maximum attempts (${exercise.max_attempts}) reached for this exercise.`,
    );

  let score = 0;
  let maxScore = 0;
  let correctCount = 0;

  const questionResults = exercise.questions.map((q, index) => {
    maxScore += q.marks || 0;
    const submitted = answers.find((a) => a.question_index === index);
    const given = submitted?.given_answer ?? "";
    const isCorrect = given !== "" && normalize(given) === normalize(q.correct_answer);

    if (isCorrect) {
      score += q.marks || 0;
      correctCount += 1;
    } else if (given) {
      score -= q.negative_marks || 0;
    }

    return {
      question_index: index,
      question_text: q.question_text,
      given_answer: given,
      correct_answer: q.correct_answer,
      is_correct: isCorrect,
      explanation: exercise.show_explanation ? q.explanation : undefined,
    };
  });

  score = Math.max(0, score);
  const accuracy = exercise.questions.length
    ? Math.round((correctCount / exercise.questions.length) * 100)
    : 0;
  const isPassed =
    maxScore > 0 ? (score / maxScore) * 100 >= PASS_THRESHOLD_PERCENT : false;

  const attempt = await StudentModuleAttempt.create({
    student_id: req.student._id,
    institute_id: req.student.institute_id,
    topic_id: exercise.topic_id,
    subtopic_id: exercise.sub_topic_id,
    module_id: exercise._id,
    module_type: "exercise",
    attempt_number: attemptCount + 1,
    score,
    max_score: maxScore,
    accuracy,
    time_spent_sec: time_spent_sec || 0,
    is_passed: isPassed,
  });

  // Mirrors the *_complete handling in activityController — every submit
  // (pass or fail) counts the exercise as attempted/complete for progress,
  // so the frontend no longer has to fire a second POST /activity to mark it done.
  await StudentProgress.findOneAndUpdate(
    { student_id: req.student._id, module_id: exercise._id, subtopic_id: exercise.sub_topic_id },
    {
      $set: {
        progress_percentage: 100,
        is_completed: true,
        completed_at: new Date(),
        last_accessed: new Date(),
        score,
        institute_id: req.student.institute_id,
        license_id: req.student.license_id,
        topic_id: exercise.topic_id,
        module_type: "exercise",
      },
    },
    { upsert: true, new: true },
  );

  return sendResponse(res, 201, true, "Exercise submitted successfully.", {
    attempt,
    question_results: questionResults,
  });
});

// GET /module/exercise/:id/result — latest attempt result
const getResult = asyncHandler(async (req, res) => {
  const { id } = req.params;

  const attempt = await StudentModuleAttempt.findOne({
    student_id: req.student._id,
    module_id: id,
    module_type: "exercise",
  }).sort({ attempt_number: -1 });

  if (!attempt)
    return sendError(res, 404, false, "No attempt found for this exercise yet.");

  return sendResponse(res, 200, true, "Result fetched successfully.", attempt);
});

// GET /module/exercise/:id/attempts — full attempt history
const getMyAttempts = asyncHandler(async (req, res) => {
  const { id } = req.params;

  const attempts = await StudentModuleAttempt.find({
    student_id: req.student._id,
    module_id: id,
    module_type: "exercise",
  }).sort({ attempt_number: 1 });

  return sendResponse(res, 200, true, "Attempts fetched successfully.", attempts);
});

module.exports = { submit, getResult, getMyAttempts };
