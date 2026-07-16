const mongoose = require("mongoose");
const { Schema, model } = mongoose;

const wordSchema = new Schema(
  {
    word: { type: String, required: true },
    pronunciation: { type: String },
    part_of_speech: {
      type: String,
      enum: ["noun", "verb", "adjective", "adverb", "phrase"],
    },
    meaning: { type: String, required: true },
    example: { type: String },
    audio_url: { type: String },
    image_url: { type: String },
    synonyms: [String],
    antonyms: [String],
    difficulty: {
      type: String,
      enum: ["easy", "medium", "hard"],
      default: "easy",
    },
  },
  { _id: false },
);

const questionSchema = new Schema(
  {
    question_text: { type: String, required: true },
    question_type: {
      type: String,
      enum: [
        "mcq",
        "fill_blank",
        "true_false",
        "short_answer",
        "match",
        "recorder",
        "spell_word",
      ],
    },
    options: [String],
    match_pairs: [
      {
        left: { type: String },
        right: { type: String },
        _id: false,
      },
    ],
    correct_answer: { type: String, required: true },
    explanation: { type: String },
    marks: { type: Number, default: 1 },
    timestamp_sec: { type: Number },
  },
  { _id: false },
);

const VideoModuleSchema = new Schema(
  {
    topic_id: { type: Schema.Types.ObjectId, ref: "Topic", required: true },
    sub_topic_id: {
      type: Schema.Types.ObjectId,
      ref: "SubTopic",
      required: true,
    },
    title: { type: String, required: true, trim: true },
    description: { type: String },
    order: { type: Number, default: 0 },
    module_type: { type: String, default: "video", immutable: true },

    video: {
      url: { type: String },
      duration_sec: { type: Number },
      thumbnail_url: { type: String },
      transcript: { type: String },
      format: { type: String, enum: ["mp4", "webm"], default: "mp4" },
      size_mb: { type: Number },
      speed: {
        type: String,
        enum: ["slow", "normal", "fast"],
        default: "normal",
      },
    },

    subtitle: [
      {
        start_time: { type: String },
        end_time: { type: String },
        text: { type: String },
        _id: false,
      },
    ],

    words: [wordSchema],
    questions: [questionSchema],

    total_marks: { type: Number, default: 0 },
    time_limit_sec: { type: Number },
    max_attempts: { type: Number, default: 3 },

    created_by: { type: Schema.Types.ObjectId, ref: "Editor", required: true },
    is_active: { type: Boolean, default: true },
  },
  { timestamps: true },
);

VideoModuleSchema.index({ topic_id: 1, sub_topic_id: 1 });
VideoModuleSchema.index({ created_by: 1 });

module.exports = model("VideoModule", VideoModuleSchema);
