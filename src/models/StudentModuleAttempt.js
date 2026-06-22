const mongoose = require("mongoose");
const { Schema, model } = mongoose;

const StudentModuleAttemptSchema = new Schema(
  {
    student_id: { type: Schema.Types.ObjectId, ref: "Student", required: true },
    institute_id: { type: Schema.Types.ObjectId, ref: "Institute", required: true },
    topic_id: { type: Schema.Types.ObjectId, ref: "Topic", required: true },
    subtopic_id: { type: Schema.Types.ObjectId, ref: "SubTopic", required: true },
    module_id: { type: Schema.Types.ObjectId, required: true },
    module_type: {
      type: String,
      enum: ["audio", "video", "text", "exercise", "vocabulary"],
      required: true,
    },
    attempt_number: { type: Number, required: true },
    score: { type: Number, default: 0 },
    max_score: { type: Number, default: 0 },
    accuracy: { type: Number, default: 0 },
    time_spent_sec: { type: Number, default: 0 },
    is_passed: { type: Boolean, default: false },
    submitted_at: { type: Date, default: Date.now },
  },
  { timestamps: false },
);

StudentModuleAttemptSchema.index({ student_id: 1, module_id: 1 });
StudentModuleAttemptSchema.index({ institute_id: 1, submitted_at: -1 });

module.exports = model("StudentModuleAttempt", StudentModuleAttemptSchema);
