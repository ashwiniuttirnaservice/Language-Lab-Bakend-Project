const mongoose = require("mongoose");
const { Schema, model } = mongoose;

const TextModuleSchema = new Schema(
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
    module_type: { type: String, default: "text", immutable: true },

    content: {
      body: { type: String, required: true },
      word_count: { type: Number },
      read_time_min: { type: Number },
      level: { type: String },
      source: { type: String },
    },

    questions: [
      {
        question_text: { type: String, required: true },
        question_type: {
          type: String,
          enum: ["mcq", "fill_blank", "true_false", "short_answer"],
        },
        options: [String],
        correct_answer: { type: String, required: true },
        explanation: { type: String },
        paragraph_ref: { type: Number },
        marks: { type: Number, default: 1 },
        _id: false,
      },
    ],

    total_marks: { type: Number, default: 0 },
    time_limit_sec: { type: Number },
    max_attempts: { type: Number, default: 3 },

    created_by: { type: Schema.Types.ObjectId, ref: "Editor", required: true },
    is_active: { type: Boolean, default: true },
  },
  { timestamps: true },
);

TextModuleSchema.index({ topic_id: 1, sub_topic_id: 1 });
TextModuleSchema.index({ created_by: 1 });

module.exports = model("TextModule", TextModuleSchema);
