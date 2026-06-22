const { Types } = require("mongoose");

const SubTopic = require("../models/SubTopic");
const asyncHandler = require("../middlewares/asyncHandler");
const { sendResponse, sendError } = require("../utils/apiResponse");

// POST /subtopic
const create = asyncHandler(async (req, res) => {
  const { topic_id, title, description, order } = req.body;

  const subtopic = await SubTopic.create({
    topic_id,
    title,
    description,
    order: order ?? 0,
    created_by: req.editor._id,
  });

  return sendResponse(res, 201, true, "SubTopic created successfully.", subtopic);
});

// GET /subtopic/topic/:topicId
const getByTopic = asyncHandler(async (req, res) => {
  const subtopics = await SubTopic.aggregate([
    {
      $match: {
        topic_id: new Types.ObjectId(req.params.topicId),
        is_active: true,
      },
    },
    { $sort: { order: 1, createdAt: 1 } },
    {
      $lookup: {
        from: "editors",
        localField: "created_by",
        foreignField: "_id",
        as: "created_by",
        pipeline: [{ $project: { full_name: 1 } }],
      },
    },
    { $unwind: { path: "$created_by", preserveNullAndEmptyArrays: true } },
  ]);

  return sendResponse(res, 200, true, "SubTopics fetched successfully.", subtopics);
});

// GET /subtopic/:id
const getOne = asyncHandler(async (req, res) => {
  const [subtopic] = await SubTopic.aggregate([
    { $match: { _id: new Types.ObjectId(req.params.id), is_active: true } },
    {
      $lookup: {
        from: "topics",
        localField: "topic_id",
        foreignField: "_id",
        as: "topic",
        pipeline: [{ $project: { title: 1, description: 1, order: 1 } }],
      },
    },
    { $unwind: { path: "$topic", preserveNullAndEmptyArrays: true } },
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

  if (!subtopic) return sendError(res, 404, false, "SubTopic not found.");

  return sendResponse(res, 200, true, "SubTopic fetched successfully.", subtopic);
});

// PUT /subtopic/:id
const update = asyncHandler(async (req, res) => {
  const subtopic = await SubTopic.findById(req.params.id);
  if (!subtopic) return sendError(res, 404, false, "SubTopic not found.");

  const { title, description, order, is_active } = req.body;

  if (title !== undefined) subtopic.title = title;
  if (description !== undefined) subtopic.description = description;
  if (order !== undefined) subtopic.order = order;
  if (is_active !== undefined) subtopic.is_active = is_active;

  await subtopic.save();

  return sendResponse(res, 200, true, "SubTopic updated successfully.", subtopic);
});

// DELETE /subtopic/:id
const remove = asyncHandler(async (req, res) => {
  const subtopic = await SubTopic.findById(req.params.id);
  if (!subtopic) return sendError(res, 404, false, "SubTopic not found.");

  subtopic.is_active = false;
  await subtopic.save();

  return sendResponse(res, 200, true, "SubTopic deactivated successfully.");
});

module.exports = { create, getByTopic, getOne, update, remove };
