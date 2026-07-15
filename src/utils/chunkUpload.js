const fs = require("fs");
const path = require("path");
const crypto = require("crypto");

const CHUNK_ROOT = path.join("uploads", "chunks");

const sessionDir = (uploadId) => path.join(CHUNK_ROOT, uploadId);
const metaPath = (uploadId) => path.join(sessionDir(uploadId), "meta.json");
const chunkPath = (uploadId, index) => path.join(sessionDir(uploadId), `chunk_${index}`);

const ensureDir = (dir) => {
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
};

function initSession({ fileName, totalChunks, fieldname, mimetype }) {
  const uploadId = crypto.randomUUID();
  ensureDir(sessionDir(uploadId));
  const meta = { uploadId, fileName, totalChunks, fieldname, mimetype, createdAt: Date.now() };
  fs.writeFileSync(metaPath(uploadId), JSON.stringify(meta));
  return meta;
}

function getSession(uploadId) {
  if (!fs.existsSync(metaPath(uploadId))) return null;
  return JSON.parse(fs.readFileSync(metaPath(uploadId), "utf-8"));
}

// Indexes already saved to disk for this session — lets the client resume
// by only (re-)sending the chunks that are missing.
function getUploadedChunkIndexes(uploadId) {
  const dir = sessionDir(uploadId);
  if (!fs.existsSync(dir)) return [];
  return fs
    .readdirSync(dir)
    .filter((f) => f.startsWith("chunk_"))
    .map((f) => Number(f.replace("chunk_", "")))
    .sort((a, b) => a - b);
}

function saveChunk(uploadId, index, buffer) {
  ensureDir(sessionDir(uploadId));
  fs.writeFileSync(chunkPath(uploadId, index), buffer);
}

// Concatenates chunk_0..chunk_N-1 into one file, in order, without ever
// holding more than one chunk in memory at a time.
async function mergeChunks(uploadId) {
  const meta = getSession(uploadId);
  if (!meta) throw new Error("Upload session not found.");

  const uploadedIndexes = getUploadedChunkIndexes(uploadId);
  if (uploadedIndexes.length !== meta.totalChunks) {
    throw new Error(`Missing chunks: expected ${meta.totalChunks}, got ${uploadedIndexes.length}.`);
  }

  const ext = path.extname(meta.fileName) || "";
  const mergedPath = path.join(sessionDir(uploadId), `merged${ext}`);
  const writeStream = fs.createWriteStream(mergedPath);

  for (let i = 0; i < meta.totalChunks; i += 1) {
    // eslint-disable-next-line no-await-in-loop
    await new Promise((resolve, reject) => {
      const readStream = fs.createReadStream(chunkPath(uploadId, i));
      readStream.on("error", reject);
      readStream.on("end", resolve);
      readStream.pipe(writeStream, { end: false });
    });
  }

  await new Promise((resolve, reject) => {
    writeStream.on("finish", resolve);
    writeStream.on("error", reject);
    writeStream.end();
  });

  return { mergedPath, meta };
}

function cleanupSession(uploadId) {
  const dir = sessionDir(uploadId);
  if (fs.existsSync(dir)) fs.rmSync(dir, { recursive: true, force: true });
}

module.exports = {
  initSession,
  getSession,
  getUploadedChunkIndexes,
  saveChunk,
  mergeChunks,
  cleanupSession,
};
