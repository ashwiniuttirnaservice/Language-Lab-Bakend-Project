const multer = require("multer");

// Chunks are small (a few MB each, set by the client) and short-lived, so
// memory storage is fine here — unlike the main uploads.js which handles
// whole files up to 1GB and must go straight to disk.
const chunkUploadMiddleware = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 12 * 1024 * 1024 }, // 12MB — safety margin over the client's expected chunk size
}).single("chunk");

module.exports = chunkUploadMiddleware;
