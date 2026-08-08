const DownloadedAsset = require("../models/DownloadedAsset");
const logger = require("../utils/logger");
const { deterministicObjectId } = require("../utils/deterministicId");
const {
  downloadFileToLocal,
  cleanupPartialFile,
  localFileIfExists,
  extFromUrl,
} = require("../utils/downloadAsset");

// Runs at most this many downloads at once per queue*Downloads() call, so a
// big course doesn't open dozens of simultaneous streams against the AWS
// proxy or saturate the institute's disk/network at once.
const CONCURRENCY = 2;

// Dedupes concurrent download attempts for the same (institute, module)
// within this process — e.g. the "Download" button getting clicked twice,
// or the course-download endpoint getting hit again before the first pass
// finished. Without this, two writers race on the same on-disk .part file:
// whichever finishes first renames it away, and the second then fails with
// ENOENT trying to rename a file that's already gone (and can overwrite the
// first one's "completed" status with "failed" right after). Keyed by
// "instituteId:moduleId" -> in-flight Promise. Shared across every asset type
// since a module_id (real or synthetic — see deterministicObjectId) is never
// reused across two different assets.
const inFlight = new Map();

// Only pushes a DB write when progress moved enough to matter, so a fast
// local network doesn't turn every download into a write-per-chunk flood.
const PROGRESS_UPDATE_STEP_BYTES = 512 * 1024; // ~512 KB

// One item to download: a real module (video/audio) or a synthetic one
// (a vocabulary word's audio/image, a course thumbnail, an institute logo).
// { module_id, module_type, title, source_url, format, defaultFormat }
async function downloadOne(institute_id, course_id, item) {
  const { module_id, module_type, title, source_url, format, defaultFormat } = item;
  if (!source_url) return;

  const fileName = `${module_id}.${extFromUrl(source_url, format || defaultFormat)}`;

  const asset = await DownloadedAsset.findOneAndUpdate(
    { institute_id, module_id },
    {
      // title kept out of $setOnInsert (and set unconditionally instead) so
      // rows created before this field existed, or ever inserted with a
      // stale/missing title, self-heal on the next download pass instead of
      // showing "Untitled" forever.
      $set: { title },
      $setOnInsert: {
        institute_id,
        course_id,
        module_id,
        module_type,
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
    logger.error(`${module_type} download failed (module ${module_id}): ${err.message}`);
    cleanupPartialFile(institute_id, fileName);
    await DownloadedAsset.updateOne(
      { _id: asset._id },
      { status: "failed", error_message: err.message },
    );
  }
}

function downloadOneDeduped(institute_id, course_id, item) {
  const key = `${institute_id}:${item.module_id}`;
  if (inFlight.has(key)) return inFlight.get(key);

  const promise = downloadOne(institute_id, course_id, item).finally(() => inFlight.delete(key));
  inFlight.set(key, promise);
  return promise;
}

// Fire-and-forget: kicks off local caching of every item's file for this
// institute + course. Callers should NOT await this inside a request handler
// that needs to respond quickly — course metadata is returned immediately,
// files finish downloading in the background, and the frontend polls
// getCourseDownloadStatus() to know when each one is ready to play/show from
// the local server instead of AWS.
function queueDownloads(institute_id, course_id, items) {
  if (!items?.length) return;

  let index = 0;
  const worker = async () => {
    while (index < items.length) {
      const current = items[index++];
      await downloadOneDeduped(institute_id, course_id, current).catch((err) =>
        logger.error(`Unexpected ${current.module_type} download error: ${err.message}`),
      );
    }
  };

  const workers = Array.from({ length: Math.min(CONCURRENCY, items.length) }, worker);
  Promise.all(workers).catch((err) => logger.error(`Download queue crashed: ${err.message}`));
}

function queueVideoDownloads(institute_id, course_id, videoModules) {
  queueDownloads(
    institute_id,
    course_id,
    (videoModules || [])
      .filter((m) => m.video?.url)
      .map((m) => ({
        module_id: m._id,
        module_type: "video",
        title: m.title,
        source_url: m.video.url,
        format: m.video.format,
        defaultFormat: "mp4",
      })),
  );
}

function queueAudioDownloads(institute_id, course_id, audioModules) {
  queueDownloads(
    institute_id,
    course_id,
    (audioModules || [])
      .filter((m) => m.audio?.url)
      .map((m) => ({
        module_id: m._id,
        module_type: "audio",
        title: m.title,
        source_url: m.audio.url,
        format: m.audio.type,
        defaultFormat: "mp3",
      })),
  );
}

// Vocabulary words carry their own audio_url/image_url (see wordSchema) but
// have no _id of their own (`{ _id: false }`) — a stable synthetic module_id
// is derived per word from the parent module's real _id + the word's index,
// so re-downloading the same course always resolves to the same asset row
// instead of creating duplicates. If words within a module get reordered,
// the index-based id will treat that as a "new" asset and re-download it —
// an acceptable tradeoff over needing schema changes to give words real ids.
function queueVocabularyAssetDownloads(institute_id, course_id, vocabularyModules) {
  const items = [];
  for (const m of vocabularyModules || []) {
    (m.words || []).forEach((word, index) => {
      if (word.audio_url) {
        items.push({
          module_id: deterministicObjectId(`${m._id}:word:${index}:audio`),
          module_type: "vocab_word_audio",
          title: `${m.title} — ${word.word} (audio)`,
          source_url: word.audio_url,
          defaultFormat: "mp3",
        });
      }
      if (word.image_url) {
        items.push({
          module_id: deterministicObjectId(`${m._id}:word:${index}:image`),
          module_type: "vocab_word_image",
          title: `${m.title} — ${word.word} (image)`,
          source_url: word.image_url,
          defaultFormat: "jpg",
        });
      }
    });
  }
  queueDownloads(institute_id, course_id, items);
}

// Single-file assets that aren't part of any module at all — a course
// thumbnail or the institute's own logo. Keyed off the owning document's
// real _id (course/institute) + a fixed suffix, so it's still stable and
// collision-free per (institute, asset) without needing its own model.
function queueSingleAssetDownload(institute_id, course_id, { key, module_type, title, source_url }) {
  if (!source_url) return;
  queueDownloads(institute_id, course_id, [
    {
      module_id: deterministicObjectId(key),
      module_type,
      title,
      source_url,
      defaultFormat: "jpg",
    },
  ]);
}

module.exports = {
  queueVideoDownloads,
  queueAudioDownloads,
  queueVocabularyAssetDownloads,
  queueSingleAssetDownload,
};
