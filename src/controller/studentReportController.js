const Student = require("../models/Student");
const Course = require("../models/Course");
const Topic = require("../models/Topic");
const StudentProgress = require("../models/StudentProgress");
const StudentModuleAttempt = require("../models/StudentModuleAttempt");
const ActivityLog = require("../models/ActivityLog");
const ExerciseModule = require("../models/ExerciseModule");
const Practical = require("../models/Practical");
const PracticalSubmission = require("../models/PracticalSubmission");
const Task = require("../models/Task");
const TaskSubmission = require("../models/TaskSubmission");
const asyncHandler = require("../middlewares/asyncHandler");
const { sendResponse, sendError } = require("../utils/apiResponse");

// Shared guard for all four report endpoints below — every one of them is
// keyed off :id, so every one of them must 403 the same way if that student
// belongs to a different institute than the one making the request.
async function loadOwnedStudent(req) {
  const student = await Student.findById(req.params.id);
  if (!student) return { error: { code: 404, message: "Student not found." } };
  if (student.institute_id.toString() !== req.institute._id.toString()) {
    return {
      error: { code: 403, message: "This student does not belong to your institute." },
    };
  }
  return { student };
}

// Resolves ?courseId= to that course's topic_ids, or null if not provided.
// Returns an error object if the id was given but doesn't resolve to a course.
async function resolveCourseTopicIds(courseId) {
  if (!courseId) return { topicIds: null };
  const course = await Course.findById(courseId).select("topic_ids");
  if (!course) return { error: { code: 404, message: "Course not found." } };
  return { topicIds: course.topic_ids };
}

// GET /institute/students/:id/topic-details?courseId=
const getTopicDetails = asyncHandler(async (req, res) => {
  const { student, error } = await loadOwnedStudent(req);
  if (error) return sendError(res, error.code, false, error.message);

  const { topicIds, error: courseError } = await resolveCourseTopicIds(req.query.courseId);
  if (courseError) return sendError(res, courseError.code, false, courseError.message);

  const progressMatch = { student_id: student._id };
  if (topicIds) progressMatch.topic_id = { $in: topicIds };

  const [progressByTopic, timeByTopic] = await Promise.all([
    StudentProgress.aggregate([
      { $match: progressMatch },
      {
        $group: {
          _id: "$topic_id",
          total_items: { $sum: 1 },
          completed_items: { $sum: { $cond: ["$is_completed", 1, 0] } },
          avg_progress: { $avg: "$progress_percentage" },
          last_accessed: { $max: "$last_accessed" },
        },
      },
    ]),
    ActivityLog.aggregate([
      { $match: progressMatch.topic_id ? { student_id: student._id, topic_id: progressMatch.topic_id } : { student_id: student._id } },
      { $group: { _id: "$topic_id", time_spent_sec: { $sum: "$time_spent_sec" } } },
    ]),
  ]);

  const timeMap = {};
  timeByTopic.forEach((t) => {
    timeMap[t._id.toString()] = t.time_spent_sec;
  });

  const topics = await Topic.find({ _id: { $in: progressByTopic.map((p) => p._id) } })
    .select("title")
    .lean();
  const titleMap = {};
  topics.forEach((t) => {
    titleMap[t._id.toString()] = t.title;
  });

  const result = progressByTopic.map((p) => ({
    topic_id: p._id,
    topic_title: titleMap[p._id.toString()] || "Unknown topic",
    total_items: p.total_items,
    completed_items: p.completed_items,
    completion_percentage: p.total_items
      ? Math.round((p.completed_items / p.total_items) * 100)
      : 0,
    avg_progress: Math.round(p.avg_progress || 0),
    last_accessed: p.last_accessed,
    time_spent_sec: timeMap[p._id.toString()] || 0,
  }));

  return sendResponse(res, 200, true, "Topic details fetched successfully.", {
    total: result.length,
    topics: result,
  });
});

// GET /institute/students/:id/exercise-report?courseId=
const getExerciseReport = asyncHandler(async (req, res) => {
  const { student, error } = await loadOwnedStudent(req);
  if (error) return sendError(res, error.code, false, error.message);

  const { topicIds, error: courseError } = await resolveCourseTopicIds(req.query.courseId);
  if (courseError) return sendError(res, courseError.code, false, courseError.message);

  const match = { student_id: student._id, module_type: "exercise" };
  if (topicIds) match.topic_id = { $in: topicIds };

  const attemptsByModule = await StudentModuleAttempt.aggregate([
    { $match: match },
    { $sort: { attempt_number: 1 } },
    {
      $group: {
        _id: "$module_id",
        attempts: { $sum: 1 },
        best_score: { $max: "$score" },
        max_score: { $first: "$max_score" },
        latest_accuracy: { $last: "$accuracy" },
        passed: { $max: { $cond: ["$is_passed", 1, 0] } },
        last_attempt_at: { $max: "$submitted_at" },
      },
    },
  ]);

  const exercises = await ExerciseModule.find({
    _id: { $in: attemptsByModule.map((a) => a._id) },
  })
    .select("title exercise_type")
    .lean();
  const exerciseMap = {};
  exercises.forEach((e) => {
    exerciseMap[e._id.toString()] = e;
  });

  const result = attemptsByModule.map((a) => {
    const exercise = exerciseMap[a._id.toString()];
    return {
      module_id: a._id,
      exercise_title: exercise?.title || "Unknown exercise",
      exercise_type: exercise?.exercise_type,
      attempts: a.attempts,
      retake_count: Math.max(0, a.attempts - 1),
      best_score: a.best_score,
      max_score: a.max_score,
      score_percentage: a.max_score ? Math.round((a.best_score / a.max_score) * 100) : 0,
      accuracy: a.latest_accuracy,
      is_passed: !!a.passed,
      last_attempt_at: a.last_attempt_at,
    };
  });

  return sendResponse(res, 200, true, "Exercise report fetched successfully.", {
    total: result.length,
    exercises: result,
  });
});

// GET /institute/students/:id/practical-report?courseId=
const getPracticalReport = asyncHandler(async (req, res) => {
  const { student, error } = await loadOwnedStudent(req);
  if (error) return sendError(res, error.code, false, error.message);

  const practicalMatch = { institute_id: student.institute_id, is_deleted: false };
  if (req.query.courseId) practicalMatch.course_id = req.query.courseId;

  const practicals = await Practical.find(practicalMatch)
    .select("title course_id questions")
    .lean();

  const submissions = await PracticalSubmission.find({
    practical_id: { $in: practicals.map((p) => p._id) },
    student_id: student._id,
  }).lean();
  const submissionMap = {};
  submissions.forEach((s) => {
    submissionMap[s.practical_id.toString()] = s;
  });

  const result = practicals.map((p) => {
    const sub = submissionMap[p._id.toString()];
    return {
      practical_id: p._id,
      title: p.title,
      status: sub?.status || "not_started",
      marks: sub?.marks ?? null,
      submitted_at: sub?.submitted_at ?? null,
    };
  });

  return sendResponse(res, 200, true, "Practical report fetched successfully.", {
    total: result.length,
    practicals: result,
  });
});

// GET /institute/students/:id/task-report?courseId=
const getTaskReport = asyncHandler(async (req, res) => {
  const { student, error } = await loadOwnedStudent(req);
  if (error) return sendError(res, error.code, false, error.message);

  const taskMatch = {
    institute_id: student.institute_id,
    is_deleted: false,
    $or: [
      { target: "all", course_id: { $in: student.purchased_courses } },
      { target: "selected", student_ids: student._id },
    ],
  };
  if (req.query.courseId) taskMatch.course_id = req.query.courseId;

  const tasks = await Task.find(taskMatch).select("title type due_date course_id").lean();

  const submissions = await TaskSubmission.find({
    task_id: { $in: tasks.map((t) => t._id) },
    student_id: student._id,
  }).lean();
  const submissionMap = {};
  submissions.forEach((s) => {
    submissionMap[s.task_id.toString()] = s;
  });

  const now = new Date();
  const result = tasks.map((t) => {
    const sub = submissionMap[t._id.toString()];
    const status = sub?.status || "pending";
    const overdue = status === "pending" && t.due_date && new Date(t.due_date) < now;
    return {
      task_id: t._id,
      title: t.title,
      type: t.type,
      due_date: t.due_date,
      status,
      overdue,
      grade: sub?.grade ?? null,
    };
  });

  return sendResponse(res, 200, true, "Task report fetched successfully.", {
    total: result.length,
    tasks: result,
  });
});

module.exports = {
  getTopicDetails,
  getExerciseReport,
  getPracticalReport,
  getTaskReport,
  // Shared with activityReportController — one source of truth for the
  // "does this student belong to me / what course was asked for" guards.
  loadOwnedStudent,
  resolveCourseTopicIds,
};
