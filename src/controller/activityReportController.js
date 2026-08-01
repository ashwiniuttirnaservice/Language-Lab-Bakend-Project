const xlsx = require("xlsx");
const { Types } = require("mongoose");

const Student = require("../models/Student");
const ActivityLog = require("../models/ActivityLog");
const Course = require("../models/Course");
const StudentProgress = require("../models/StudentProgress");
const StudentModuleAttempt = require("../models/StudentModuleAttempt");
const Practical = require("../models/Practical");
const PracticalSubmission = require("../models/PracticalSubmission");
const Task = require("../models/Task");
const TaskSubmission = require("../models/TaskSubmission");
const asyncHandler = require("../middlewares/asyncHandler");
const { sendResponse, sendError } = require("../utils/apiResponse");
const { loadOwnedStudent, resolveCourseTopicIds } = require("./studentReportController");

// Builds the shared per-student activity aggregation used by both the JSON
// endpoint and the CSV export, so the two can never drift out of sync.
async function buildActivityRows(req) {
  const instituteId = req.institute._id;
  const { courseId, from, to, studentId } = req.query;

  const match = { institute_id: new Types.ObjectId(instituteId) };
  if (studentId) match.student_id = new Types.ObjectId(studentId);
  if (from || to) {
    match.logged_at = {};
    if (from) match.logged_at.$gte = new Date(from);
    if (to) match.logged_at.$lte = new Date(to);
  }
  if (courseId) {
    const course = await Course.findById(courseId).select("topic_ids");
    if (!course) return { error: { code: 404, message: "Course not found." } };
    match.topic_id = { $in: course.topic_ids };
  }

  const perStudent = await ActivityLog.aggregate([
    { $match: match },
    {
      $group: {
        _id: "$student_id",
        time_spent_sec: { $sum: "$time_spent_sec" },
        last_activity: { $max: "$logged_at" },
        // No explicit session model on ActivityLog — distinct active calendar
        // days is the closest proxy without adding a new tracked concept.
        active_days: {
          $addToSet: { $dateToString: { format: "%Y-%m-%d", date: "$logged_at" } },
        },
        modules_touched: {
          $addToSet: {
            topic_id: "$topic_id",
            sub_topic_id: "$sub_topic_id",
            module_type: "$module_type",
          },
        },
      },
    },
    {
      $project: {
        time_spent_sec: 1,
        last_activity: 1,
        session_count: { $size: "$active_days" },
        modules_opened: { $size: "$modules_touched" },
      },
    },
  ]);

  const students = await Student.find(
    { _id: { $in: perStudent.map((p) => p._id) }, institute_id: instituteId },
    "full_name enrollment_no last_login",
  ).lean();
  const studentMap = {};
  students.forEach((s) => {
    studentMap[s._id.toString()] = s;
  });

  const rows = perStudent
    .filter((p) => studentMap[p._id.toString()])
    .map((p) => {
      const s = studentMap[p._id.toString()];
      return {
        student_id: p._id,
        full_name: s.full_name,
        enrollment_no: s.enrollment_no,
        last_login: s.last_login,
        session_count: p.session_count,
        time_spent_sec: p.time_spent_sec,
        modules_opened: p.modules_opened,
        last_activity: p.last_activity,
      };
    });

  return { rows };
}

// GET /institute/activity-log?courseId=&from=&to=&studentId=
const getActivityLog = asyncHandler(async (req, res) => {
  const { rows, error } = await buildActivityRows(req);
  if (error) return sendError(res, error.code, false, error.message);

  return sendResponse(res, 200, true, "Activity log fetched successfully.", {
    total: rows.length,
    students: rows,
  });
});

// GET /institute/activity-log/export?...&format=csv
const exportActivityLog = asyncHandler(async (req, res) => {
  const { rows, error } = await buildActivityRows(req);
  if (error) return sendError(res, error.code, false, error.message);

  const csvRows = rows.map((r) => ({
    "Student ID": r.student_id.toString(),
    "Full Name": r.full_name,
    "Enrollment No": r.enrollment_no || "",
    "Last Login": r.last_login ? new Date(r.last_login).toISOString() : "",
    "Session Count": r.session_count,
    "Time Spent (sec)": r.time_spent_sec,
    "Modules Opened": r.modules_opened,
    "Last Activity": r.last_activity ? new Date(r.last_activity).toISOString() : "",
  }));

  const sheet = xlsx.utils.json_to_sheet(csvRows);
  const csv = xlsx.utils.sheet_to_csv(sheet);

  res.setHeader("Content-Type", "text/csv");
  res.setHeader("Content-Disposition", 'attachment; filename="activity-log.csv"');
  return res.status(200).send(csv);
});

// GET /institute/students/:id/progress-report?courseId=
const getProgressReport = asyncHandler(async (req, res) => {
  const { student, error } = await loadOwnedStudent(req);
  if (error) return sendError(res, error.code, false, error.message);

  const { topicIds, error: courseError } = await resolveCourseTopicIds(req.query.courseId);
  if (courseError) return sendError(res, courseError.code, false, courseError.message);

  const topicMatch = { student_id: student._id };
  if (topicIds) topicMatch.topic_id = { $in: topicIds };
  const [topicAgg] = await StudentProgress.aggregate([
    { $match: topicMatch },
    {
      $group: {
        _id: null,
        total: { $sum: 1 },
        completed: { $sum: { $cond: ["$is_completed", 1, 0] } },
      },
    },
  ]);
  const topicStats = topicAgg || { total: 0, completed: 0 };

  const exerciseMatch = { student_id: student._id, module_type: "exercise" };
  if (topicIds) exerciseMatch.topic_id = { $in: topicIds };
  const [exerciseAgg] = await StudentModuleAttempt.aggregate([
    { $match: exerciseMatch },
    { $group: { _id: "$module_id", passed: { $max: { $cond: ["$is_passed", 1, 0] } } } },
    { $group: { _id: null, total: { $sum: 1 }, completed: { $sum: "$passed" } } },
  ]);
  const exerciseStats = exerciseAgg || { total: 0, completed: 0 };

  const practicalMatch = { institute_id: student.institute_id, is_deleted: false };
  if (req.query.courseId) practicalMatch.course_id = req.query.courseId;
  const practicals = await Practical.find(practicalMatch).select("_id").lean();
  const practicalCompleted = await PracticalSubmission.countDocuments({
    practical_id: { $in: practicals.map((p) => p._id) },
    student_id: student._id,
    status: { $in: ["submitted", "reviewed"] },
  });
  const practicalStats = { total: practicals.length, completed: practicalCompleted };

  const taskMatch = {
    institute_id: student.institute_id,
    is_deleted: false,
    $or: [
      { target: "all", course_id: { $in: student.purchased_courses } },
      { target: "selected", student_ids: student._id },
    ],
  };
  if (req.query.courseId) taskMatch.course_id = req.query.courseId;
  const tasks = await Task.find(taskMatch).select("_id").lean();
  const taskCompleted = await TaskSubmission.countDocuments({
    task_id: { $in: tasks.map((t) => t._id) },
    student_id: student._id,
    status: { $in: ["submitted", "reviewed", "late"] },
  });
  const taskStats = { total: tasks.length, completed: taskCompleted };

  const pct = (s) => (s.total ? Math.round((s.completed / s.total) * 100) : 0);
  const overallTotal =
    topicStats.total + exerciseStats.total + practicalStats.total + taskStats.total;
  const overallCompleted =
    topicStats.completed +
    exerciseStats.completed +
    practicalStats.completed +
    taskStats.completed;

  return sendResponse(res, 200, true, "Progress report fetched successfully.", {
    overall_completion_percentage: overallTotal
      ? Math.round((overallCompleted / overallTotal) * 100)
      : 0,
    breakdown: {
      topics: { ...topicStats, completion_percentage: pct(topicStats) },
      exercises: { ...exerciseStats, completion_percentage: pct(exerciseStats) },
      practicals: { ...practicalStats, completion_percentage: pct(practicalStats) },
      tasks: { ...taskStats, completion_percentage: pct(taskStats) },
    },
  });
});

// GET /institute/students/:id/activity-summary
// Powers the "Login Time" / "Last Activity" fields on the Student Statistics
// page — last_activity mirrors the Activity Log page's definition (max
// ActivityLog.logged_at) so the two views never disagree on what "recent"
// means for the same student.
const getStudentActivitySummary = asyncHandler(async (req, res) => {
  const { student, error } = await loadOwnedStudent(req);
  if (error) return sendError(res, error.code, false, error.message);

  const [latest] = await ActivityLog.aggregate([
    { $match: { student_id: student._id } },
    { $group: { _id: null, last_activity: { $max: "$logged_at" } } },
  ]);

  return sendResponse(res, 200, true, "Activity summary fetched successfully.", {
    last_login: student.last_login || null,
    last_activity: latest?.last_activity || null,
  });
});

// GET /institute/students/:id/activity-history?page=&limit=
const getStudentActivityHistory = asyncHandler(async (req, res) => {
  const { student, error } = await loadOwnedStudent(req);
  if (error) return sendError(res, error.code, false, error.message);

  const page = Math.max(1, Number(req.query.page) || 1);
  const limit = Math.min(200, Number(req.query.limit) || 50);

  const [logs, total] = await Promise.all([
    ActivityLog.find({ student_id: student._id })
      .populate("topic_id", "title")
      .populate("sub_topic_id", "title")
      .sort({ logged_at: -1 })
      .skip((page - 1) * limit)
      .limit(limit)
      .lean(),
    ActivityLog.countDocuments({ student_id: student._id }),
  ]);

  return sendResponse(res, 200, true, "Activity history fetched successfully.", {
    total,
    page,
    limit,
    logs,
  });
});

module.exports = {
  getActivityLog,
  exportActivityLog,
  getProgressReport,
  getStudentActivitySummary,
  getStudentActivityHistory,
};
