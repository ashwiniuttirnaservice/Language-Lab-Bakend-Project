const mongoose = require("mongoose");
const { Schema, model } = mongoose;

// One row per student per task — created lazily when a student actually
// submits (via the Student Panel endpoints, built separately), not
// pre-materialized for every assigned student at task-creation time.
const TaskSubmissionSchema = new Schema(
  {
    task_id: { type: Schema.Types.ObjectId, ref: "Task", required: true },
    student_id: { type: Schema.Types.ObjectId, ref: "Student", required: true },

    submitted_media_url: { type: String },
    submitted_text: { type: String },

    // Answers to the task's own optional quiz-checkpoint questions
    // (Task.questions[]). Keyed by array index since those questions don't
    // carry their own _id (questionSchema uses { _id: false }).
    answers: [
      {
        question_index: { type: Number, required: true },
        given_answer: { type: String },
        _id: false,
      },
    ],

    status: {
      type: String,
      enum: ["pending", "submitted", "late", "reviewed"],
      default: "pending",
    },

    grade: { type: Number },
    feedback: { type: String },

    submitted_at: { type: Date },
  },
  { timestamps: true },
);

TaskSubmissionSchema.index({ task_id: 1, student_id: 1 }, { unique: true });
TaskSubmissionSchema.index({ student_id: 1, status: 1 });

module.exports = model("TaskSubmission", TaskSubmissionSchema);
