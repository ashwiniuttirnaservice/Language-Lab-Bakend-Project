const mongoose = require("mongoose");
const { Schema, model } = mongoose;

// Tracks, per institute, whether a module's media file (currently: video)
// has actually been pulled down to this server's local disk — separate from
// Institute.downloaded_course_ids, which only means the topic/module
// *metadata* was mirrored. A row here is the source of truth for whether
// playback can be served locally instead of proxying to AWS.
const DownloadedAssetSchema = new Schema(
  {
    institute_id: { type: Schema.Types.ObjectId, ref: "Institute", required: true },
    course_id: { type: Schema.Types.ObjectId, ref: "Course", required: true },
    module_id: { type: Schema.Types.ObjectId, required: true },
    module_type: { type: String, default: "video" },
    title: { type: String }, // module title, mirrored here so the status endpoint doesn't need a join

    source_url: { type: String, required: true },
    local_path: { type: String }, // absolute path on disk
    file_name: { type: String },
    size_bytes: { type: Number },
    // Live byte progress while status === "downloading", for a real per-video
    // progress bar on the frontend (not just a pending/downloading/done dot).
    total_bytes: { type: Number, default: 0 },
    downloaded_bytes: { type: Number, default: 0 },

    status: {
      type: String,
      enum: ["pending", "downloading", "completed", "failed"],
      default: "pending",
    },
    error_message: { type: String },
  },
  { timestamps: true },
);

DownloadedAssetSchema.index({ institute_id: 1, module_id: 1 }, { unique: true });

module.exports = model("DownloadedAsset", DownloadedAssetSchema);
