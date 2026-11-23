const mongoose = require("mongoose");
const { Schema, model } = mongoose;

const ConversationSessionSchema = new Schema(
  {
    institute_id: {
      type: Schema.Types.ObjectId,
      ref: "Institute",
      required: true,
      index: true,
    },
    initiator_id: {
      type: Schema.Types.ObjectId,
      ref: "Student",
      required: true,
    },
    partner_id: {
      type: Schema.Types.ObjectId,
      ref: "Student",
      required: true,
    },
    // Array of both participant IDs for index-optimized queries
    participants: [
      {
        type: Schema.Types.ObjectId,
        ref: "Student",
        index: true,
      },
    ],
    status: {
      type: String,
      enum: ["active", "ended"],
      default: "active",
      index: true,
    },
    ended_by: {
      type: Schema.Types.ObjectId,
      ref: "Student",
    },
    ended_at: {
      type: Date,
    },
  },
  { timestamps: true }
);

ConversationSessionSchema.index({ institute_id: 1, status: 1 });
ConversationSessionSchema.index({ participants: 1, status: 1 });

module.exports = model("ConversationSession", ConversationSessionSchema);

