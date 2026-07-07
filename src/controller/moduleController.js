const fs = require("fs");
const VideoModule = require("../models/VideoModule");
const AudioModule = require("../models/AudioModule");
const TextModule = require("../models/TextModule");
const ExerciseModule = require("../models/ExerciseModule");
const VocabularyModule = require("../models/VocabularyModule");
const asyncHandler = require("../middlewares/asyncHandler");
const { sendResponse, sendError } = require("../utils/apiResponse");
const uploadToAws = require("../utils/awsUpload");

const MODEL_MAP = {
  video: VideoModule,
  audio: AudioModule,
  text: TextModule,
  exercise: ExerciseModule,
  vocabulary: VocabularyModule,
};

const FOLDER_MAP = {
  video: "modules/videos",
  audio: "modules/audio",
};

const parseJsonField = (value) => {
  if (typeof value === "string") {
    try {
      return JSON.parse(value);
    } catch {
      return value;
    }
  }
  return value;
};

// Students must not see correct answers before submitting an attempt.
const stripAnswers = (doc) => {
  const plain = doc.toObject();
  plain.questions = plain.questions.map(({ correct_answer, explanation, ...q }) => q);
  return plain;
};

// POST /module/:type
const create = asyncHandler(async (req, res) => {
  const { type } = req.params;
  const Model = MODEL_MAP[type];
  if (!Model) return sendError(res, 400, false, `Invalid module type: ${type}`);

  const data = { ...req.body };

  // Parse JSON string fields (sent as strings in multipart/form-data)
  ["questions", "words", "video", "audio", "content", "subtitle"].forEach(
    (field) => {
      if (data[field]) data[field] = parseJsonField(data[field]);
    },
  );

  // Handle file upload for video/audio
  if (req.file && FOLDER_MAP[type]) {
    const uploaded = await uploadToAws({
      file: req.file,
      fileName: `${type}_${Date.now()}`,
      folderName: FOLDER_MAP[type],
    });
    fs.unlink(req.file.path, () => {});
    const url = uploaded?.cdnUrl || uploaded?.fullS3URL || "";

    if (type === "video") {
      data.video = { ...(data.video || {}), url };
    } else if (type === "audio") {
      data.audio = { ...(data.audio || {}), url };
    }
  }

  data.created_by = req.editor._id;

  const module = await Model.create(data);

  return sendResponse(
    res,
    201,
    true,
    `${type} module created successfully.`,
    module,
  );
});

// GET /module/:type?subtopic_id=xxx  — list modules for a subtopic
const getBySubTopic = asyncHandler(async (req, res) => {
  const { type } = req.params;
  const Model = MODEL_MAP[type];
  if (!Model) return sendError(res, 400, false, `Invalid module type: ${type}`);

  const { subtopic_id } = req.query;
  if (!subtopic_id)
    return sendError(res, 400, false, "subtopic_id query param required.");

  const modules = await Model.find({
    sub_topic_id: subtopic_id,
    is_active: true,
  })
    .populate("topic_id", "title")
    .populate("sub_topic_id", "title")
    .sort({ order: 1 });

  const data =
    type === "exercise" && req.student ? modules.map(stripAnswers) : modules;

  return sendResponse(
    res,
    200,
    true,
    `${type} modules fetched successfully.`,
    data,
  );
});

// GET /module/:type/:id
const getOne = asyncHandler(async (req, res) => {
  const { type, id } = req.params;
  const Model = MODEL_MAP[type];
  if (!Model) return sendError(res, 400, false, `Invalid module type: ${type}`);

  const module = await Model.findById(id)
    .populate("topic_id",     "title")
    .populate("sub_topic_id", "title");
  if (!module || !module.is_active)
    return sendError(res, 404, false, "Module not found.");

  if (type === "exercise" && req.student) {
    return sendResponse(res, 200, true, "Module fetched successfully.", stripAnswers(module));
  }

  return sendResponse(res, 200, true, "Module fetched successfully.", module);
});

// PUT /module/:type/:id
const update = asyncHandler(async (req, res) => {
  const { type, id } = req.params;
  const Model = MODEL_MAP[type];
  if (!Model) return sendError(res, 400, false, `Invalid module type: ${type}`);

  const module = await Model.findById(id);
  if (!module || !module.is_active)
    return sendError(res, 404, false, "Module not found.");

  const data = { ...req.body };

  ["questions", "words", "video", "audio", "content", "subtitle"].forEach(
    (field) => {
      if (data[field]) data[field] = parseJsonField(data[field]);
    },
  );

  if (req.file && FOLDER_MAP[type]) {
    const uploaded = await uploadToAws({
      file: req.file,
      fileName: `${type}_${Date.now()}`,
      folderName: FOLDER_MAP[type],
    });
    fs.unlink(req.file.path, () => {});
    const url = uploaded?.cdnUrl || uploaded?.fullS3URL || "";

    if (type === "video")
      data.video = { ...(module.video?.toObject?.() || {}), url };
    if (type === "audio")
      data.audio = { ...(module.audio?.toObject?.() || {}), url };
  }

  Object.assign(module, data);
  await module.save();

  return sendResponse(res, 200, true, "Module updated successfully.", module);
});

// DELETE /module/:type/:id
const remove = asyncHandler(async (req, res) => {
  const { type, id } = req.params;
  const Model = MODEL_MAP[type];
  if (!Model) return sendError(res, 400, false, `Invalid module type: ${type}`);

  const module = await Model.findById(id);
  if (!module) return sendError(res, 404, false, "Module not found.");

  module.is_active = false;
  await module.save();

  return sendResponse(res, 200, true, "Module deactivated successfully.");
});

module.exports = { create, getBySubTopic, getOne, update, remove };
