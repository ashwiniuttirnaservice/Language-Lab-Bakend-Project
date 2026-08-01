const mongoose = require("mongoose");
const { Schema, model } = mongoose;

// One row per student per practical (not per question) — each row holds an
// answer for every question in that practical, keyed by the question's own
// _id inside Practical.questions[].
const AnswerSchema = new Schema(
  {
    question_id: { type: Schema.Types.ObjectId, required: true },
    answer_html: { type: String },
    // Set when this specific question's solution_type is "file" — the
    // student's uploaded file for just this question (independent of the
    // whole-submission attachment_url, which is only for solution_type:file
    // at the manual-wide level).
    answer_file_url: { type: String },
  },
  { timestamps: false },
);

// Read by the Student Statistics "Practical Manual Report" (Institute Panel)
// and by the student's own practical-manual view (Student Panel, built separately).
const PracticalSubmissionSchema = new Schema(
  {
    practical_id: {
      type: Schema.Types.ObjectId,
      ref: "Practical",
      required: true,
    },
    student_id: { type: Schema.Types.ObjectId, ref: "Student", required: true },

    answers: [AnswerSchema],
    attachment_url: { type: String },

    // Whether the student typed paragraph solutions per-question ("text") or
    // uploaded a single file (PDF) covering the whole practical ("file").
    solution_type: {
      type: String,
      enum: ["text", "file"],
      default: "text",
    },

    status: {
      type: String,
      enum: ["draft", "submitted", "reviewed"],
      default: "draft",
    },

    marks: { type: Number },
    feedback: { type: String },

    submitted_at: { type: Date },
    reviewed_at: { type: Date },
  },
  { timestamps: true },
);

PracticalSubmissionSchema.index(
  { practical_id: 1, student_id: 1 },
  { unique: true },
);
PracticalSubmissionSchema.index({ student_id: 1, status: 1 });

module.exports = model("PracticalSubmission", PracticalSubmissionSchema);
