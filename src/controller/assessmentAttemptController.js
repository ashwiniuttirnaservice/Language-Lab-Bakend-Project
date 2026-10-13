const Assessment = require("../models/Assessment");
const AssessmentAttempt = require("../models/AssessmentAttempt");
const asyncHandler = require("../middlewares/asyncHandler");
const { sendResponse, sendError } = require("../utils/apiResponse");

const PASS_THRESHOLD_PERCENT = 40;

const normalize = (str) => String(str ?? "").trim().toLowerCase();

// POST /assessment/:id/submit — same flow as module/exercise/:id/submit
const submit = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const { answers, time_spent_sec } = req.body;

  const assessment = await Assessment.findById(id);
  if (!assessment || !assessment.is_active)
    return sendError(res, 404, false, "Assessment not found.");

  // If the student had an in-progress (saved via save-progress) attempt,
  // finish that one instead of counting a fresh slot against max_attempts.
  const inProgress = await AssessmentAttempt.findOne({
    student_id: req.student._id,
    assessment_id: id,
    status: "in_progress",
  });

  const attemptCount = await AssessmentAttempt.countDocuments({
    student_id: req.student._id,
    assessment_id: id,
    status: "completed",
  });

  if (!inProgress && attemptCount >= assessment.max_attempts)
    return sendError(
      res,
      403,
      false,
      `Maximum attempts (${assessment.max_attempts}) reached for this assessment.`,
    );

  let score = 0;
  let maxScore = 0;
  let correctCount = 0;

  const questionResults = assessment.questions.map((q, index) => {
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
      explanation: assessment.show_explanation ? q.explanation : undefined,
    };
  });

  score = Math.max(0, score);
  const accuracy = assessment.questions.length
    ? Math.round((correctCount / assessment.questions.length) * 100)
    : 0;
  const isPassed =
    maxScore > 0 ? (score / maxScore) * 100 >= PASS_THRESHOLD_PERCENT : false;

  let attempt;
  if (inProgress) {
    inProgress.status = "completed";
    inProgress.answers = answers;
    inProgress.score = score;
    inProgress.max_score = maxScore;
    inProgress.accuracy = accuracy;
    inProgress.time_spent_sec = time_spent_sec || 0;
    inProgress.remaining_time_sec = 0;
    inProgress.is_passed = isPassed;
    inProgress.submitted_at = new Date();
    await inProgress.save();
    attempt = inProgress;
  } else {
    attempt = await AssessmentAttempt.create({
      student_id: req.student._id,
      institute_id: req.student.institute_id,
      subject_id: assessment.subject_id,
      assessment_id: assessment._id,
      attempt_number: attemptCount + 1,
      status: "completed",
      score,
      max_score: maxScore,
      accuracy,
      time_spent_sec: time_spent_sec || 0,
      is_passed: isPassed,
    });
  }

  return sendResponse(res, 201, true, "Assessment submitted successfully.", {
    attempt,
    question_results: questionResults,
  });
});

// GET /assessment/:id/result — latest completed (graded) attempt
const getResult = asyncHandler(async (req, res) => {
  const { id } = req.params;

  const attempt = await AssessmentAttempt.findOne({
    student_id: req.student._id,
    assessment_id: id,
    status: "completed",
  }).sort({ attempt_number: -1 });

  if (!attempt)
    return sendError(res, 404, false, "No attempt found for this assessment yet.");

  return sendResponse(res, 200, true, "Result fetched successfully.", attempt);
});

// GET /assessment/:id/attempts — full completed-attempt history (retest count / progression)
const getMyAttempts = asyncHandler(async (req, res) => {
  const { id } = req.params;

  const attempts = await AssessmentAttempt.find({
    student_id: req.student._id,
    assessment_id: id,
    status: "completed",
  }).sort({ attempt_number: 1 });

  return sendResponse(res, 200, true, "Attempts fetched successfully.", attempts);
});

// POST /assessment/:id/save-progress — upserts the in-progress attempt with
// whatever the student has answered so far + time left. Mirrors
// carrer-jupiter-backend's Result doc (answers + remainingTime saved mid-test),
// but layered onto our per-attempt log via status: "in_progress" instead of
// a separate one-doc-per-user collection.
const saveProgress = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const { answers, remaining_time_sec } = req.body;

  const assessment = await Assessment.findById(id);
  if (!assessment || !assessment.is_active)
    return sendError(res, 404, false, "Assessment not found.");

  let attempt = await AssessmentAttempt.findOne({
    student_id: req.student._id,
    assessment_id: id,
    status: "in_progress",
  });

  if (!attempt) {
    const attemptCount = await AssessmentAttempt.countDocuments({
      student_id: req.student._id,
      assessment_id: id,
      status: "completed",
    });

    if (attemptCount >= assessment.max_attempts)
      return sendError(
        res,
        403,
        false,
        `Maximum attempts (${assessment.max_attempts}) reached for this assessment.`,
      );

    attempt = new AssessmentAttempt({
      student_id: req.student._id,
      institute_id: req.student.institute_id,
      subject_id: assessment.subject_id,
      assessment_id: assessment._id,
      attempt_number: attemptCount + 1,
      status: "in_progress",
    });
  }

  attempt.answers = answers || [];
  attempt.remaining_time_sec = remaining_time_sec || 0;
  await attempt.save();

  return sendResponse(res, 200, true, "Progress saved successfully.", attempt);
});

// GET /assessment/:id/resume — saved answers + time left for an in-progress attempt
const resume = asyncHandler(async (req, res) => {
  const { id } = req.params;

  const attempt = await AssessmentAttempt.findOne({
    student_id: req.student._id,
    assessment_id: id,
    status: "in_progress",
  });

  if (!attempt)
    return sendError(res, 404, false, "No in-progress attempt to resume.");

  return sendResponse(res, 200, true, "Resumed successfully.", attempt);
});

module.exports = { submit, getResult, getMyAttempts, saveProgress, resume };
