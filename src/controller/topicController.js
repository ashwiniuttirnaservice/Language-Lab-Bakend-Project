const { Types } = require("mongoose");

const Topic = require("../models/Topic");
const Course = require("../models/Course");
const asyncHandler = require("../middlewares/asyncHandler");
const { sendResponse, sendError } = require("../utils/apiResponse");

// POST /topic  — Topic is standalone, no course_id needed here
// Assigning topics to courses is done via PUT /super-admin/course/:id (topic_ids[])
const create = asyncHandler(async (req, res) => {
  const { title, description, order } = req.body;

  const topic = await Topic.create({
    title,
    description,
    order: order ?? 0,
    created_by: req.editor._id,
  });

  return sendResponse(res, 201, true, "Topic created successfully.", topic);
});

// GET /topic
const getAll = asyncHandler(async (req, res) => {
  let matchStage = { is_active: true };

  if (req.editor) {
    matchStage.created_by = new Types.ObjectId(req.editor._id);
  } else if (req.student) {
    const Institute = require("../models/Institute");
    const institute = await Institute.findById(req.student.institute_id).select("course_id");

    if (institute?.course_id?.length) {
      // Get all courses for this institute, collect topic_ids from each
      const courses = await Course.find(
        { _id: { $in: institute.course_id }, is_active: true },
        { topic_ids: 1 },
      ).lean();

      // Flatten all topic_ids arrays + deduplicate via Set
      const seen = new Set();
      const allTopicIds = [];
      for (const c of courses) {
        for (const id of c.topic_ids) {
          const key = id.toString();
          if (!seen.has(key)) {
            seen.add(key);
            allTopicIds.push(new Types.ObjectId(key));
          }
        }
      }

      if (!allTopicIds.length) {
        return sendResponse(res, 200, true, "Topics fetched successfully.", []);
      }

      matchStage._id = { $in: allTopicIds };
    }
  }

  const topics = await Topic.aggregate([
    { $match: matchStage },
    { $sort: { order: 1, createdAt: 1 } },
    {
      $lookup: {
        from: "subtopics",
        localField: "_id",
        foreignField: "topic_id",
        as: "subtopics",
        pipeline: [
          { $match: { is_active: true } },
          { $sort: { order: 1 } },
          { $project: { title: 1, description: 1, order: 1 } },
        ],
      },
    },
    { $addFields: { subtopic_count: { $size: "$subtopics" } } },
  ]);

  return sendResponse(res, 200, true, "Topics fetched successfully.", topics);
});

// GET /topic/:id
const getOne = asyncHandler(async (req, res) => {
  const [topic] = await Topic.aggregate([
    { $match: { _id: new Types.ObjectId(req.params.id), is_active: true } },
    {
      $lookup: {
        from: "subtopics",
        localField: "_id",
        foreignField: "topic_id",
        as: "subtopics",
        pipeline: [
          { $match: { is_active: true } },
          { $sort: { order: 1 } },
        ],
      },
    },
    {
      $lookup: {
        from: "editors",
        localField: "created_by",
        foreignField: "_id",
        as: "created_by",
        pipeline: [{ $project: { full_name: 1, email: 1 } }],
      },
    },
    { $unwind: { path: "$created_by", preserveNullAndEmptyArrays: true } },
  ]);

  if (!topic) return sendError(res, 404, false, "Topic not found.");

  return sendResponse(res, 200, true, "Topic fetched successfully.", topic);
});

// PUT /topic/:id
const update = asyncHandler(async (req, res) => {
  const topic = await Topic.findById(req.params.id);
  if (!topic) return sendError(res, 404, false, "Topic not found.");

  const { title, description, order, is_active } = req.body;

  if (title !== undefined) topic.title = title;
  if (description !== undefined) topic.description = description;
  if (order !== undefined) topic.order = order;
  if (is_active !== undefined) topic.is_active = is_active;

  await topic.save();

  return sendResponse(res, 200, true, "Topic updated successfully.", topic);
});

// DELETE /topic/:id
const remove = asyncHandler(async (req, res) => {
  const topic = await Topic.findById(req.params.id);
  if (!topic) return sendError(res, 404, false, "Topic not found.");

  topic.is_active = false;
  await topic.save();

  return sendResponse(res, 200, true, "Topic deactivated successfully.");
});

module.exports = { create, getAll, getOne, update, remove };
