const mongoose = require("mongoose");
const { Schema, model } = mongoose;

const NotificationSchema = new Schema(
  {
    // Target Recipient
    recipient_type: {
      type: String,
      enum: ["student", "institute", "teacher"],
      required: true,
    },
    recipient_id: {
      type: Schema.Types.ObjectId,
      required: true,
      refPath: "recipient_model",
    },
    recipient_model: {
      type: String,
      required: true,
      enum: ["Student", "Institute", "Teacher"],
    },
    institute_id: {
      type: Schema.Types.ObjectId,
      ref: "Institute",
      required: true,
    },

    // Content
    title: {
      type: String,
      required: true,
      trim: true,
    },
    description: {
      type: String,
      required: true,
      trim: true,
    },

    // Categorization
    category: {
      type: String,
      enum: [
        "exercise",
        "video",
        "audio",
        "text",
        "vocabulary",
        "task",
        "practical_manual",
        "system",
      ],
      required: true,
    },
    type: {
      type: String,
      enum: [
        "Exercise",
        "Video",
        "Audio",
        "Text",
        "Vocabulary",
        "Task",
        "Practical Manual",
        "System",
      ],
      required: true,
    },
    priority: {
      type: String,
      enum: ["Incomplete", "Resubmit", "Results", "Completed", "Info"],
      default: "Incomplete",
    },

    // Interaction & Deep Linking
    action_url: {
      type: String,
      trim: true,
    },
    action_label: {
      type: String,
      default: "View Details",
      trim: true,
    },

    // Status Tracking
    is_read: {
      type: Boolean,
      default: false,
    },
    read_at: {
      type: Date,
    },

    // Optional metadata (e.g. task_id, practical_id, marks, score, etc.)
    meta_data: {
      type: Schema.Types.Mixed,
      default: {},
    },
  },
  {
    timestamps: true,
  }
);

// Performance indexes for querying notifications and navbar unread counts
NotificationSchema.index({ recipient_id: 1, is_read: 1, createdAt: -1 });
NotificationSchema.index({ recipient_id: 1, priority: 1, createdAt: -1 });
NotificationSchema.index({ institute_id: 1, createdAt: -1 });

module.exports = model("Notification", NotificationSchema);
