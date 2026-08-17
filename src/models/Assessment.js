const mongoose = require("mongoose");
const { Schema, model } = mongoose;

// Same shape as ExerciseModule (src/models/ExerciseModule.js), but scoped to
// a Subject instead of a Topic/SubTopic — a Subject can have many Assessments.
const AssessmentSchema = new Schema(
  {
    subject_id: { type: Schema.Types.ObjectId, ref: "Subject", required: true },

    title: { type: String, required: true, trim: true },
    description: { type: String },
    order: { type: Number, default: 0 },
    module_type: { type: String, default: "assessment", immutable: true },

    difficulty: {
      type: String,
      enum: ["easy", "medium", "hard"],
      default: "easy",
    },

    questions: [
      {
        question_text: { type: String, required: true },
        // MCQ-only now — matches the reference project's IQTest question
        // shape: optionA/B required, C/D optional.
        optionA: { type: String, required: true },
        optionB: { type: String, required: true },
        optionC: { type: String, default: "" },
        optionD: { type: String, default: "" },
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

    // "0" = assessment hidden from students, "1" = shown. Toggled by whoever
    // manages the subject (super admin / institute) via update.
    userType: {
      type: String,
      default: "0",
    },

    created_by: { type: Schema.Types.ObjectId },
    is_active: { type: Boolean, default: true },
  },
  { timestamps: true },
);

AssessmentSchema.index({ subject_id: 1 });
AssessmentSchema.index({ created_by: 1 });

module.exports = model("Assessment", AssessmentSchema);
