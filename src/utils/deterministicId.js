const crypto = require("crypto");
const mongoose = require("mongoose");

// Some assets worth caching locally don't have their own top-level module_id
// to key DownloadedAsset by — a vocabulary word's audio_url/image_url lives
// inside an array subdocument with `_id: false` (see wordSchema), and a course
// thumbnail / institute logo aren't "modules" at all. DownloadedAsset.module_id
// has no `ref` constraint (see its schema comment), so any stable ObjectId
// works as long as it's the same value every time this exact asset is asked
// for again — an MD5 hash of a human-readable seed, truncated to 12 bytes,
// gives exactly that: deterministic, collision-safe in practice, and valid
// ObjectId hex without needing a real Mongo _id to exist anywhere.
function deterministicObjectId(seed) {
  const hex = crypto.createHash("md5").update(seed).digest("hex").slice(0, 24);
  return new mongoose.Types.ObjectId(hex);
}

module.exports = { deterministicObjectId };
