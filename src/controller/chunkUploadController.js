const uploadToAws = require("../utils/awsUpload");
const asyncHandler = require("../middlewares/asyncHandler");
const { sendResponse, sendError } = require("../utils/apiResponse");
const {
  initSession,
  getSession,
  getUploadedChunkIndexes,
  saveChunk,
  mergeChunks,
  cleanupSession,
} = require("../utils/chunkUpload");

// Same fieldname → AWS folder convention already used by each controller's
// direct uploadToAws() calls (moduleController, instituteController, etc.).
// studentExcel is deliberately excluded — it's parsed locally with xlsx and
// never forwarded to AWS, so chunking it would have nothing to complete into.
const FIELD_FOLDER_MAP = {
  profileImage: "super-admin",
  logo: "institutes",
  profilePhoto: "editors",
  studentPhoto: "students",
  videoFile: "modules/videos",
  audioFile: "modules/audio",
};

// POST /upload/chunk/init
const initUpload = asyncHandler(async (req, res) => {
  const { fileName, totalChunks, fieldname, mimetype } = req.body;

  if (!fileName || !totalChunks || !fieldname) {
    return sendError(res, 400, false, "fileName, totalChunks and fieldname are required.");
  }
  if (!FIELD_FOLDER_MAP[fieldname]) {
    return sendError(res, 400, false, `Invalid or unsupported upload field: ${fieldname}`);
  }

  const session = initSession({
    fileName,
    totalChunks: Number(totalChunks),
    fieldname,
    mimetype: mimetype || "application/octet-stream",
  });

  return sendResponse(res, 201, true, "Upload session created.", { uploadId: session.uploadId });
});

// POST /upload/chunk/:uploadId/:chunkIndex — field name "chunk"
const uploadChunk = asyncHandler(async (req, res) => {
  const { uploadId, chunkIndex } = req.params;
  const session = getSession(uploadId);
  if (!session) return sendError(res, 404, false, "Upload session not found or expired.");

  const index = Number(chunkIndex);
  if (Number.isNaN(index) || index < 0 || index >= session.totalChunks) {
    return sendError(res, 400, false, "Invalid chunk index.");
  }
  if (!req.file?.buffer) return sendError(res, 400, false, "No chunk data received.");

  saveChunk(uploadId, index, req.file.buffer);

  return sendResponse(res, 200, true, "Chunk received.", {
    chunkIndex: index,
    uploadedChunks: getUploadedChunkIndexes(uploadId).length,
    totalChunks: session.totalChunks,
  });
});

// GET /upload/chunk/:uploadId/status — lets the client resume by skipping already-uploaded chunks
const getStatus = asyncHandler(async (req, res) => {
  const { uploadId } = req.params;
  const session = getSession(uploadId);
  if (!session) return sendError(res, 404, false, "Upload session not found or expired.");

  return sendResponse(res, 200, true, "Status fetched.", {
    uploadId,
    totalChunks: session.totalChunks,
    uploadedChunks: getUploadedChunkIndexes(uploadId),
  });
});

// POST /upload/chunk/:uploadId/complete — merge chunks in order, forward to AWS, clean up
const completeUpload = asyncHandler(async (req, res) => {
  const { uploadId } = req.params;
  const session = getSession(uploadId);
  if (!session) return sendError(res, 404, false, "Upload session not found or expired.");

  try {
    const { mergedPath } = await mergeChunks(uploadId);

    // uploadToAws() deletes mergedPath itself once the AWS request settles.
    const uploaded = await uploadToAws({
      file: { path: mergedPath, originalname: session.fileName, mimetype: session.mimetype },
      fileName: `${session.fieldname}_${Date.now()}`,
      folderName: FIELD_FOLDER_MAP[session.fieldname],
    });

    return sendResponse(res, 200, true, "File uploaded successfully.", uploaded);
  } catch (error) {
    return sendError(res, 500, false, error.message || "Failed to complete upload.");
  } finally {
    cleanupSession(uploadId);
  }
});

module.exports = { initUpload, uploadChunk, getStatus, completeUpload };
