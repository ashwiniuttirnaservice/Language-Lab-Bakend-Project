const fs = require("fs");
const path = require("path");
const axios = require("axios");
const logger = require("./logger");

// Root folder where AWS-hosted media is mirrored for offline/local playback.
// Kept out of git (uploads/ is already gitignored) and organized per
// institute so one institute's local cache never leaks into another's.
const DOWNLOAD_ROOT = path.join(__dirname, "..", "..", "uploads", "downloaded");

function localDirFor(instituteId) {
  return path.join(DOWNLOAD_ROOT, instituteId.toString());
}

function extFromUrl(url, fallback = "mp4") {
  const clean = url.split("?")[0];
  const ext = path.extname(clean).replace(".", "");
  return ext || fallback;
}

// Streams `url` to disk at uploads/downloaded/<instituteId>/<fileName> and
// resolves with the absolute path + byte size. Downloads to a .part file
// first and renames on success, so a crash/interrupt mid-download never
// leaves a half-written file that looks complete.
//
// Callers MUST serialize concurrent downloads of the same (instituteId,
// fileName) pair themselves (see videoDownloadService's in-flight map) —
// two writers racing on the same .part path is what used to produce
// "ENOENT: no such file or directory, rename ...": the first one to finish
// renames .part away, and the second then finds nothing left to rename.
async function downloadFileToLocal({ url, instituteId, fileName, onProgress }) {
  const dir = localDirFor(instituteId);
  fs.mkdirSync(dir, { recursive: true });

  const destPath = path.join(dir, fileName);
  const partPath = `${destPath}.part`;

  const response = await axios.get(url, {
    responseType: "stream",
    maxContentLength: Infinity,
    maxBodyLength: Infinity,
  });

  const totalBytes = Number(response.headers["content-length"]) || 0;
  let downloadedBytes = 0;

  await new Promise((resolve, reject) => {
    const writer = fs.createWriteStream(partPath);
    response.data.on("data", (chunk) => {
      downloadedBytes += chunk.length;
      onProgress?.(downloadedBytes, totalBytes);
    });
    response.data.pipe(writer);
    writer.on("finish", resolve);
    writer.on("error", reject);
    response.data.on("error", reject);
  });

  fs.renameSync(partPath, destPath);
  const { size } = fs.statSync(destPath);
  return { localPath: destPath, sizeBytes: size };
}

// Lets a caller skip re-downloading when the file already landed on disk —
// e.g. after the DB row got left in a stale "failed" state by the old
// rename-race bug even though the file itself downloaded fine.
function localFileIfExists(instituteId, fileName) {
  const destPath = path.join(localDirFor(instituteId), fileName);
  if (!fs.existsSync(destPath)) return null;
  const { size } = fs.statSync(destPath);
  return { localPath: destPath, sizeBytes: size };
}

function cleanupPartialFile(instituteId, fileName) {
  const partPath = path.join(localDirFor(instituteId), `${fileName}.part`);
  if (fs.existsSync(partPath)) {
    try {
      fs.unlinkSync(partPath);
    } catch (err) {
      logger.error(`Failed to clean up partial download ${partPath}: ${err.message}`);
    }
  }
}

module.exports = {
  downloadFileToLocal,
  cleanupPartialFile,
  localFileIfExists,
  localDirFor,
  extFromUrl,
  DOWNLOAD_ROOT,
};
