const mongoose = require("mongoose");
const { Schema, model } = mongoose;

// A single numbered question within a practical (e.g. "1. Write the
// importance of professional communication in 4 to 5 sentences") — a
// practical manual entry is rarely just one question, it's usually several
// under one title (see: MSBTE-style lab manuals, "Practical related
// questions" section with Q1, Q2, Q3...).
const QuestionSchema = new Schema(
  {
    question_text: { type: String, required: true, trim: true },
    // Institute's own model answer / answer key for this specific question — optional.
    answer_key_html: { type: String },
    // How many ruled lines the student sees when answering this question.
    answer_lines: { type: Number, required: true, min: 1, max: 50, default: 5 },
    // Institute-chosen answer format for this question — "text" shows the
    // rich text editor, "file" shows a file upload field, "both" lets the
    // student pick either on the student side.
    solution_type: { type: String, enum: ["text", "file", "both"], default: "text" },
  },
  { timestamps: false },
);

const PracticalSchema = new Schema(
  {
    institute_id: {
      type: Schema.Types.ObjectId,
      ref: "Institute",
      required: true,
    },
    course_id: { type: Schema.Types.ObjectId, ref: "Course", required: true },
    topic_id: { type: Schema.Types.ObjectId, ref: "Topic" },

    // e.g. "Practical No. 1: Communication Process and Cycle"
    title: { type: String, required: true, trim: true },

    questions: {
      type: [QuestionSchema],
      validate: {
        validator: (arr) => Array.isArray(arr) && arr.length > 0,
        message: "At least one question is required.",
      },
    },

    // Shared reference material for the whole practical (e.g. a resource
    // sheet or diagram), not per-question.
    attachment_url: { type: String },
    attachment_type: { type: String, enum: ["image", "pdf"] },

    created_by: {
      type: Schema.Types.ObjectId,
      ref: "Institute",
      required: true,
    },
    // Soft delete — past PracticalSubmission records must stay valid even
    // after the institute removes the question.
    is_deleted: { type: Boolean, default: false },
  },
  { timestamps: true },
);

PracticalSchema.index({ institute_id: 1, course_id: 1 });
PracticalSchema.index({ institute_id: 1, is_deleted: 1 });

module.exports = model("Practical", PracticalSchema);
