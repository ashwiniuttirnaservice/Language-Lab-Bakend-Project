const mongoose = require("mongoose");
const { Schema, model } = mongoose;

// Mirrors StudentModuleAttempt (src/models/StudentModuleAttempt.js), but
// scoped to subject_id instead of topic_id/subtopic_id since Assessment
// hangs off a Subject, not a Topic/SubTopic.
const AssessmentAttemptSchema = new Schema(
  {
    student_id: { type: Schema.Types.ObjectId, ref: "Student", required: true },
    institute_id: { type: Schema.Types.ObjectId, ref: "Institute", required: true },
    subject_id: { type: Schema.Types.ObjectId, ref: "Subject", required: true },
    assessment_id: { type: Schema.Types.ObjectId, ref: "Assessment", required: true },
    attempt_number: { type: Number, required: true },

    // "in_progress" while the student is mid-test (save-progress/resume),
    // "completed" once submit() grades it — mirrors carrer-jupiter-backend's
    // Result doc (answers + remainingTime saved mid-attempt, read back by
    // resumeTest), but kept as a status on our existing per-attempt log
    // instead of a separate one-doc-per-user collection.
    status: { type: String, enum: ["in_progress", "completed"], default: "completed" },
    answers: [
      {
        question_index: { type: Number, required: true },
        given_answer: { type: String, default: "" },
        _id: false,
      },
    ],
    remaining_time_sec: { type: Number, default: 0 },

    score: { type: Number, default: 0 },
    max_score: { type: Number, default: 0 },
    accuracy: { type: Number, default: 0 },
    time_spent_sec: { type: Number, default: 0 },
    is_passed: { type: Boolean, default: false },
    submitted_at: { type: Date, default: Date.now },
  },
  { timestamps: false },
);

AssessmentAttemptSchema.index({ student_id: 1, assessment_id: 1, status: 1 });
AssessmentAttemptSchema.index({ student_id: 1, assessment_id: 1 });
AssessmentAttemptSchema.index({ institute_id: 1, submitted_at: -1 });

module.exports = model("AssessmentAttempt", AssessmentAttemptSchema);
