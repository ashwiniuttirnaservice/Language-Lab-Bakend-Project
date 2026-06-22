const mongoose = require("mongoose");
const { Schema, model } = mongoose;

const CourseSchema = new Schema(
  {
    course_name: { type: String, required: true, trim: true },
    course_code: {
      type: String,
      required: true,
      unique: true,
      uppercase: true,
    },
    description: { type: String },
    created_by: {
      type: Schema.Types.ObjectId,
      ref: "SuperAdmin",
      required: true,
    },
    level: {
      type: String,
      enum: ["beginner", "intermediate", "advanced"],
    },
    topic_ids: [{ type: Schema.Types.ObjectId, ref: "Topic" }],
    language: { type: String },
    duration_days: { type: Number },
    is_active: { type: Boolean, default: true },
    thumbnail_url: { type: String },
  },
  { timestamps: true },
);

CourseSchema.index({ course_code: 1 });
CourseSchema.index({ created_by: 1 });

module.exports = model("Course", CourseSchema);
