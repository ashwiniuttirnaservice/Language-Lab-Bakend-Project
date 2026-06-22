const mongoose = require("mongoose");
const { Schema, model } = mongoose;

const StudentProgressSchema = new Schema(
  {
    student_id: { type: Schema.Types.ObjectId, ref: "Student", required: true },
    institute_id: { type: Schema.Types.ObjectId, ref: "Institute", required: true },
    license_id: { type: Schema.Types.ObjectId, ref: "License", required: true },
    topic_id: { type: Schema.Types.ObjectId, ref: "Topic", required: true },
    subtopic_id: { type: Schema.Types.ObjectId, ref: "SubTopic", required: true },
    module_type: {
      type: String,
      enum: ["audio", "video", "text", "exercise", "vocabulary"],
      required: true,
    },
    module_id: { type: Schema.Types.ObjectId, required: true },
    progress_percentage: { type: Number, min: 0, max: 100, default: 0 },
    score: { type: Number, default: 0 },
    is_completed: { type: Boolean, default: false },
    completed_at: { type: Date, default: null },
    last_accessed: { type: Date, default: Date.now },
  },
  { timestamps: true },
);

StudentProgressSchema.index({ student_id: 1, topic_id: 1, subtopic_id: 1 });
StudentProgressSchema.index({ student_id: 1, module_id: 1 });

module.exports = model("StudentProgress", StudentProgressSchema);
