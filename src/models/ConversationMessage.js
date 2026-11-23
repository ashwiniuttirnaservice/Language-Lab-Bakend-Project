const mongoose = require("mongoose");
const { Schema, model } = mongoose;

const ConversationMessageSchema = new Schema(
  {
    session_id: {
      type: Schema.Types.ObjectId,
      ref: "ConversationSession",
      required: true,
      index: true,
    },
    institute_id: {
      type: Schema.Types.ObjectId,
      ref: "Institute",
      required: true,
      index: true,
    },
    sender_id: {
      type: Schema.Types.ObjectId,
      ref: "Student",
      required: true,
    },
    receiver_id: {
      type: Schema.Types.ObjectId,
      ref: "Student",
      required: true,
    },
    message: {
      type: String,
      required: true,
      trim: true,
    },
  },
  { timestamps: true }
);

ConversationMessageSchema.index({ session_id: 1, createdAt: 1 });
ConversationMessageSchema.index({ sender_id: 1, receiver_id: 1, createdAt: 1 });

module.exports = model("ConversationMessage", ConversationMessageSchema);

