const mongoose = require("mongoose");
const { Schema, model } = mongoose;

const ActivityLogSchema = new Schema(
  {
    student_id: { type: Schema.Types.ObjectId, ref: "Student", required: true },
    institute_id: { type: Schema.Types.ObjectId, ref: "Institute", required: true },
    editor_id: { type: Schema.Types.ObjectId, ref: "Editor" },

    topic_id: { type: Schema.Types.ObjectId, ref: "Topic", required: true },
    sub_topic_id: { type: Schema.Types.ObjectId, ref: "SubTopic", required: true },

    // Fixed: added 'vocabulary' — was missing, vocabulary logs failed validation
    module_type: {
      type: String,
      enum: ["audio", "video", "text", "exercise", "vocabulary"],
      required: true,
    },

    // Fixed: added 'ai_query' — was missing, Mist
    // ral usage could not be logged
    activity_type: {
      type: String,
      enum: [
        "video_play", "video_pause", "video_forward", "video_backward", "video_complete",
        "audio_play", "audio_pause", "audio_replay", "audio_complete",
        "text_start", "text_complete",
        "exercise_start", "exercise_submit", "exercise_complete", "exercise_skip",
        "vocabulary_start", "vocabulary_submit", "vocabulary_complete", "vocabulary_skip",
        "attendance_marked",
        "ai_query",
        // Duration-only heartbeat logged when a student switches away from or
        // leaves a module — the one place every module type (including text/
        // vocabulary, which have no *_complete event) gets real time tracked.
        "module_time",
      ],
      required: true,
    },

    progress_percent: { type: Number, default: 0 },
    timestamp_in_media: { type: Number },
    time_spent_sec: { type: Number, default: 0 },

    score: { type: Number },
    max_score: { type: Number },
    accuracy: { type: Number },

    logged_at: { type: Date, default: Date.now },
  },
  { timestamps: false },
);

ActivityLogSchema.index({ student_id: 1, logged_at: -1 });
ActivityLogSchema.index({ institute_id: 1, logged_at: -1 });
ActivityLogSchema.index({ topic_id: 1, sub_topic_id: 1 });

module.exports = model("ActivityLog", ActivityLogSchema);
