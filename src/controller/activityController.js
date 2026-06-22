const ActivityLog = require("../models/ActivityLog");
const StudentProgress = require("../models/StudentProgress");
const Attendance = require("../models/Attendance");
const asyncHandler = require("../middlewares/asyncHandler");
const { sendResponse } = require("../utils/apiResponse");

// POST /activity — student logs an action
const log = asyncHandler(async (req, res) => {
  const {
    topic_id,
    sub_topic_id,
    module_id,
    module_type,
    activity_type,
    progress_percent,
    timestamp_in_media,
    time_spent_sec,
    score,
    max_score,
    accuracy,
  } = req.body;

  const entry = await ActivityLog.create({
    student_id: req.student._id,
    institute_id: req.student.institute_id,
    topic_id,
    sub_topic_id,
    module_type,
    activity_type,
    progress_percent,
    timestamp_in_media,
    time_spent_sec,
    score,
    max_score,
    accuracy,
  });

  // On any *_complete event → upsert StudentProgress
  if (activity_type.endsWith("_complete") && module_id) {
    await StudentProgress.findOneAndUpdate(
      { student_id: req.student._id, module_id, subtopic_id: sub_topic_id },
      {
        $set: {
          progress_percentage: 100,
          is_completed: true,
          completed_at: new Date(),
          last_accessed: new Date(),
          score: score || 0,
          institute_id: req.student.institute_id,
          license_id: req.student.license_id,
          topic_id,
          module_type,
        },
      },
      { upsert: true, new: true },
    );
  }

  // On attendance_marked → upsert today's attendance
  if (activity_type === "attendance_marked") {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    await Attendance.findOneAndUpdate(
      { student_id: req.student._id, institute_id: req.student.institute_id, date: today },
      {
        $setOnInsert: {
          login_time: new Date(),
          status: "present",
          license_id: req.student.license_id,
        },
      },
      { upsert: true },
    );
  }

  return sendResponse(res, 201, true, "Activity logged.", entry);
});

// GET /activity/me — student's own activity
const getMyActivity = asyncHandler(async (req, res) => {
  const logs = await ActivityLog.find({ student_id: req.student._id })
    .sort({ logged_at: -1 })
    .limit(100);

  return sendResponse(res, 200, true, "Activity fetched successfully.", logs);
});

// GET /activity/student/:id — teacher/college views
const getStudentActivity = asyncHandler(async (req, res) => {
  const { Types } = require("mongoose");
  const { module_type, limit = 100 } = req.query;

  const matchStage = { student_id: new Types.ObjectId(req.params.id) };
  if (module_type) matchStage.module_type = module_type;

  const logs = await ActivityLog.aggregate([
    { $match: matchStage },
    { $sort: { logged_at: -1 } },
    { $limit: Number(limit) },
  ]);

  return sendResponse(res, 200, true, "Activity fetched successfully.", logs);
});

module.exports = { log, getMyActivity, getStudentActivity };
