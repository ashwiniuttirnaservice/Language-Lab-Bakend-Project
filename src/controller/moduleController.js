const fs = require("fs");
const VideoModule = require("../models/VideoModule");
const AudioModule = require("../models/AudioModule");
const TextModule = require("../models/TextModule");
const ExerciseModule = require("../models/ExerciseModule");
const VocabularyModule = require("../models/VocabularyModule");
const asyncHandler = require("../middlewares/asyncHandler");
const { sendResponse, sendError } = require("../utils/apiResponse");
const uploadToAws = require("../utils/awsUpload");
const DownloadedAsset = require("../models/DownloadedAsset");

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
  plain.questions = plain.questions.map(
    ({ correct_answer, explanation, ...q }) => q,
  );
  return plain;
};

// Attaches each video/audio module's locally-cached playback URL (see
// instituteController.downloadCourseData + service/videoDownloadService.js)
// so the student player can play from this institute's own server instead
// of streaming from AWS whenever the file has already been downloaded.
// No-op for anyone other than an authenticated student (editors/admins
// previewing content have no institute to scope a local cache to).
const attachLocalMediaUrls = async (mediaDocs, req, mediaType) => {
  const instituteId = req.student?.institute_id;
  if (!instituteId || !mediaDocs.length) {
    return mediaDocs.map((doc) => (doc.toObject ? doc.toObject() : doc));
  }

  const assets = await DownloadedAsset.find({
    institute_id: instituteId,
    module_id: { $in: mediaDocs.map((d) => d._id) },
  })
    .select("module_id status file_name")
    .lean();
  const assetByModuleId = new Map(assets.map((a) => [a.module_id.toString(), a]));

  return mediaDocs.map((doc) => {
    const plain = doc.toObject ? doc.toObject() : doc;
    const asset = assetByModuleId.get(plain._id.toString());
    plain[mediaType] = {
      ...plain[mediaType],
      download_status: asset?.status || "pending",
      local_url:
        asset?.status === "completed"
          ? `/media/${instituteId}/${asset.file_name}`
          : null,
    };
    return plain;
  });
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

  const { subtopic_id, content_module_id } = req.query;
  if (!subtopic_id && !content_module_id)
    return sendError(
      res,
      400,
      false,
      "subtopic_id or content_module_id query param required.",
    );

  const filter = { is_active: true };
  if (subtopic_id) filter.sub_topic_id = subtopic_id;
  if (content_module_id) {
    filter.content_module_id = content_module_id;
  } else if (type === "exercise" && req.student) {
    // Exercises attached to a specific lesson module (via content_module_id)
    // should only surface through that lesson's own "Start Exercise" flow,
    // not in the student's general subtopic-wide exercise list.
    filter.content_module_id = null;
  }

  const modules = await Model.find(filter)
    .populate("topic_id", "title")
    .populate("sub_topic_id", "title")
    .sort({ order: 1 });

  let data;
  if (type === "exercise" && req.student) {
    data = modules.map(stripAnswers);
  } else if (type === "video" || type === "audio") {
    data = await attachLocalMediaUrls(modules, req, type);
  } else {
    data = modules;
  }

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
    .populate("topic_id", "title")
    .populate("sub_topic_id", "title");
  if (!module || !module.is_active)
    return sendError(res, 404, false, "Module not found.");

  if (type === "exercise" && req.student) {
    return sendResponse(
      res,
      200,
      true,
      "Module fetched successfully.",
      stripAnswers(module),
    );
  }

  if (type === "video" || type === "audio") {
    const [decorated] = await attachLocalMediaUrls([module], req, type);
    return sendResponse(res, 200, true, "Module fetched successfully.", decorated);
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
