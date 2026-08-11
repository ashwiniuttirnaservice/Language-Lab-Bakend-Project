const mongoose = require("mongoose");
const { Schema, model } = mongoose;

// Institute-configured grant: makes a course's topic/subtopics visible to
// students in a given segment ("department") + year ("batch"). Course/topic
// content itself lives in Course/Topic/SubTopic — this only records who gets
// to see which slice of it.
const StudentLearningAccessSchema = new Schema(
  {
    institute_id: {
      type: Schema.Types.ObjectId,
      ref: "Institute",
      required: true,
    },
    course_id: { type: Schema.Types.ObjectId, ref: "Course", required: true },
    topic_id: { type: Schema.Types.ObjectId, ref: "Topic", required: true },
    subtopic_ids: {
      type: [{ type: Schema.Types.ObjectId, ref: "SubTopic" }],
      validate: {
        validator: (arr) => Array.isArray(arr) && arr.length > 0,
        message: "At least one subtopic must be selected.",
      },
      required: true,
    },

    // ── Target audience (mirrors Student.segment / Student.year) ──
    segment: { type: String, required: true, trim: true },
    year: { type: Number, required: true },

    is_active: { type: Boolean, default: true },
  },
  { timestamps: true },
);

StudentLearningAccessSchema.index({ institute_id: 1, segment: 1, year: 1 });
StudentLearningAccessSchema.index({ institute_id: 1, course_id: 1, topic_id: 1 });

module.exports = model("StudentLearningAccess", StudentLearningAccessSchema);
