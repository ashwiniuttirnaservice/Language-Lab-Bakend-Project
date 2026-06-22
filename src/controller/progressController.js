const { Types } = require("mongoose");

const StudentProgress = require("../models/StudentProgress");
const asyncHandler = require("../middlewares/asyncHandler");
const { sendResponse } = require("../utils/apiResponse");

// GET /progress/me — student's own progress
const getMyProgress = asyncHandler(async (req, res) => {
  const progress = await StudentProgress.aggregate([
    { $match: { student_id: new Types.ObjectId(req.student._id) } },
    { $sort: { last_accessed: -1 } },
    {
      $lookup: {
        from: "topics",
        localField: "topic_id",
        foreignField: "_id",
        as: "topic",
        pipeline: [{ $project: { title: 1 } }],
      },
    },
    { $unwind: { path: "$topic", preserveNullAndEmptyArrays: true } },
    {
      $lookup: {
        from: "subtopics",
        localField: "subtopic_id",
        foreignField: "_id",
        as: "subtopic",
        pipeline: [{ $project: { title: 1 } }],
      },
    },
    { $unwind: { path: "$subtopic", preserveNullAndEmptyArrays: true } },
  ]);

  return sendResponse(res, 200, true, "Progress fetched successfully.", progress);
});

// GET /progress/student/:id — teacher/college views a student's progress
const getStudentProgress = asyncHandler(async (req, res) => {
  const progress = await StudentProgress.aggregate([
    { $match: { student_id: new Types.ObjectId(req.params.id) } },
    { $sort: { last_accessed: -1 } },
    {
      $lookup: {
        from: "topics",
        localField: "topic_id",
        foreignField: "_id",
        as: "topic",
        pipeline: [{ $project: { title: 1 } }],
      },
    },
    { $unwind: { path: "$topic", preserveNullAndEmptyArrays: true } },
    {
      $lookup: {
        from: "subtopics",
        localField: "subtopic_id",
        foreignField: "_id",
        as: "subtopic",
        pipeline: [{ $project: { title: 1 } }],
      },
    },
    { $unwind: { path: "$subtopic", preserveNullAndEmptyArrays: true } },
    {
      $group: {
        _id: "$topic_id",
        topic: { $first: "$topic" },
        modules_completed: { $sum: { $cond: ["$is_completed", 1, 0] } },
        total_modules: { $sum: 1 },
        avg_score: { $avg: "$score" },
        last_accessed: { $max: "$last_accessed" },
        details: { $push: "$$ROOT" },
      },
    },
    { $sort: { last_accessed: -1 } },
  ]);

  return sendResponse(res, 200, true, "Progress fetched successfully.", progress);
});

module.exports = { getMyProgress, getStudentProgress };
