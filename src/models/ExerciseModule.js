const mongoose = require("mongoose");
const { Schema, model } = mongoose;

const ExerciseModuleSchema = new Schema(
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
    module_type: { type: String, default: "exercise", immutable: true },
    exercise_type: {
      type: String,

      required: true,
    },
    difficulty: {
      type: String,
      enum: ["easy", "medium", "hard"],
      default: "easy",
    },

    questions: [
      {
        question_text: { type: String, required: true },
        question_type: {
          type: String,
          enum: ["mcq", "fill_blank", "true_false", "match", "reorder"],
        },
        options: [String],
        correct_answer: { type: String, required: true },
        explanation: { type: String },
        hint: { type: String },
        marks: { type: Number, default: 1 },
        negative_marks: { type: Number, default: 0 },
        _id: false,
      },
    ],

    shuffle_questions: { type: Boolean, default: true },
    shuffle_options: { type: Boolean, default: true },
    show_explanation: { type: Boolean, default: true },
    total_marks: { type: Number, default: 0 },
    time_limit_sec: { type: Number },
    max_attempts: { type: Number, default: 5 },

    created_by: { type: Schema.Types.ObjectId, ref: "Editor", required: true },
    is_active: { type: Boolean, default: true },
  },
  { timestamps: true },
);

ExerciseModuleSchema.index({ topic_id: 1, sub_topic_id: 1 });
ExerciseModuleSchema.index({ created_by: 1, exercise_type: 1 });

module.exports = model("ExerciseModule", ExerciseModuleSchema);
