const mongoose = require("mongoose");
const { Schema, model } = mongoose;

const InteractiveTaskSchema = new Schema(
  {
    institute_id: {
      type: Schema.Types.ObjectId,
      ref: "Institute",
      required: true,
      index: true,
    },
    // Links to Course and Topic
    course_id: {
      type: Schema.Types.ObjectId,
      ref: "Course",
      required: true,
      index: true,
    },
    topic_id: {
      type: Schema.Types.ObjectId,
      ref: "Topic",
      required: true,
      index: true,
    },

    title: {
      type: String,
      required: true,
      trim: true,
    },
    // Target reference paragraph for students to read aloud
    paragraph: {
      type: String,
      required: true,
      trim: true,
    },

    // Retry limits configured at creation time (1 to 5 attempts)
    max_retries: {
      type: Number,
      default: 3,
      min: 1,
      max: 5,
    },

    // Target reading speed (Words Per Minute)
    target_wpm: {
      type: Number,
      default: 120,
    },

    // Minimum passing accuracy percentage (e.g. 75%)
    min_accuracy: {
      type: Number,
      default: 75,
      min: 1,
      max: 100,
    },

    // Department/Branch assignment (Institute can assign to all; faculty to assigned branches)
    assigned_department: {
      type: String,
      trim: true,
      default: null,
    },
    // Batch/Year assignment (null = all batches in that department)
    assigned_batch: {
      type: Number,
      default: null,
    },

    created_by_role: {
      type: String,
      enum: ["institute", "faculty"],
      default: "institute",
    },
    created_by_id: {
      type: Schema.Types.ObjectId,
      required: true,
    },

    status: {
      type: String,
      enum: ["draft", "published", "closed"],
      default: "published",
    },
    is_deleted: {
      type: Boolean,
      default: false,
    },
  },
  { timestamps: true },
);

InteractiveTaskSchema.index({ institute_id: 1, course_id: 1 });
InteractiveTaskSchema.index({ institute_id: 1, topic_id: 1 });
InteractiveTaskSchema.index({ institute_id: 1, is_deleted: 1 });

module.exports = model("InteractiveTask", InteractiveTaskSchema);

