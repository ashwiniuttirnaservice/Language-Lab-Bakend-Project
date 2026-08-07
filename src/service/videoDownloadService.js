const DownloadedAsset = require("../models/DownloadedAsset");
const logger = require("../utils/logger");
const {
  downloadFileToLocal,
  cleanupPartialFile,
  localFileIfExists,
  extFromUrl,
} = require("../utils/downloadAsset");

// Runs at most this many video downloads at once per queueVideoDownloads()
// call, so a big course doesn't open dozens of simultaneous streams against
// the AWS proxy or saturate the institute's disk/network at once.
const CONCURRENCY = 2;

// Dedupes concurrent download attempts for the same (institute, module)
// within this process — e.g. the "Download" button getting clicked twice,
// or the course-download endpoint getting hit again before the first pass
// finished. Without this, two writers race on the same on-disk .part file:
// whichever finishes first renames it away, and the second then fails with
// ENOENT trying to rename a file that's already gone (and can overwrite the
// first one's "completed" status with "failed" right after). Keyed by
// "instituteId:moduleId" -> in-flight Promise.
const inFlight = new Map();

// Only pushes a DB write when progress moved enough to matter, so a fast
// local network doesn't turn every download into a write-per-chunk flood.
const PROGRESS_UPDATE_STEP_BYTES = 512 * 1024; // ~512 KB

async function downloadOne(institute_id, course_id, videoModule) {
  const module_id = videoModule._id;
  const source_url = videoModule.video?.url;
  if (!source_url) return;

  const fileName = `${module_id}.${extFromUrl(source_url, videoModule.video?.format || "mp4")}`;

  const asset = await DownloadedAsset.findOneAndUpdate(
    { institute_id, module_id },
    {
      // title kept out of $setOnInsert (and set unconditionally instead) so
      // rows created before this field existed, or ever inserted with a
      // stale/missing title, self-heal on the next download pass instead of
      // showing "Untitled video" forever.
      $set: { title: videoModule.title },
      $setOnInsert: {
        institute_id,
        course_id,
        module_id,
        module_type: "video",
        source_url,
      },
    },
    { upsert: true, new: true },
  );

  if (asset.status === "completed") return; // already have it locally

  // Self-heal: a DB row can be stuck "failed"/"pending" while the file is
  // actually already sitting on disk (e.g. left over from the old
  // rename-race bug, or a crash right after the rename but before the DB
  // update). Don't re-download — just reconcile the record.
  const existing = localFileIfExists(institute_id, fileName);
  if (existing) {
    await DownloadedAsset.updateOne(
      { _id: asset._id },
      {
        status: "completed",
        local_path: existing.localPath,
        file_name: fileName,
        size_bytes: existing.sizeBytes,
        downloaded_bytes: existing.sizeBytes,
        total_bytes: existing.sizeBytes,
        error_message: null,
      },
    );
    return;
  }

  await DownloadedAsset.updateOne(
    { _id: asset._id },
    { status: "downloading", error_message: null, downloaded_bytes: 0 },
  );

  let lastPersistedBytes = 0;
  try {
    const { localPath, sizeBytes } = await downloadFileToLocal({
      url: source_url,
      instituteId: institute_id,
      fileName,
      onProgress: (downloaded, total) => {
        if (downloaded - lastPersistedBytes < PROGRESS_UPDATE_STEP_BYTES) return;
        lastPersistedBytes = downloaded;
        DownloadedAsset.updateOne(
          { _id: asset._id },
          { downloaded_bytes: downloaded, total_bytes: total },
        ).catch(() => {}); // best-effort; a missed tick just delays the UI, not the download
      },
    });
    await DownloadedAsset.updateOne(
      { _id: asset._id },
      {
        status: "completed",
        local_path: localPath,
        file_name: fileName,
        size_bytes: sizeBytes,
        downloaded_bytes: sizeBytes,
        total_bytes: sizeBytes,
      },
    );
  } catch (err) {
    logger.error(`Video download failed (module ${module_id}): ${err.message}`);
    cleanupPartialFile(institute_id, fileName);
    await DownloadedAsset.updateOne(
      { _id: asset._id },
      { status: "failed", error_message: err.message },
    );
  }
}

function downloadOneDeduped(institute_id, course_id, videoModule) {
  const key = `${institute_id}:${videoModule._id}`;
  if (inFlight.has(key)) return inFlight.get(key);

  const promise = downloadOne(institute_id, course_id, videoModule).finally(() =>
    inFlight.delete(key),
  );
  inFlight.set(key, promise);
  return promise;
}

// Fire-and-forget: kicks off local caching of every video module's file for
// this institute + course. Callers should NOT await this inside a request
// handler that needs to respond quickly — course metadata is returned
// immediately, video files finish downloading in the background, and the
// frontend polls getDownloadStatus() to know when each one is ready to play
// from the local server instead of AWS.
function queueVideoDownloads(institute_id, course_id, videoModules) {
  if (!videoModules?.length) return;

  let index = 0;
  const worker = async () => {
    while (index < videoModules.length) {
      const current = videoModules[index++];
      await downloadOneDeduped(institute_id, course_id, current).catch((err) =>
        logger.error(`Unexpected video download error: ${err.message}`),
      );
    }
  };

  const workers = Array.from({ length: Math.min(CONCURRENCY, videoModules.length) }, worker);
  Promise.all(workers).catch((err) =>
    logger.error(`Video download queue crashed: ${err.message}`),
  );
}

module.exports = { queueVideoDownloads };
