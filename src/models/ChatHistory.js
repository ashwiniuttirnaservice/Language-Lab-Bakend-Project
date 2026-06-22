const mongoose = require("mongoose");
const { Schema, model } = mongoose;

const ChatHistorySchema = new Schema(
  {
    student_id: { type: Schema.Types.ObjectId, ref: "Student", required: true },
    // Fixed: added institute_id — was missing, needed for editor dashboards & analytics
    institute_id: { type: Schema.Types.ObjectId, ref: "Institute", required: true },
    // Fixed: added session_id — links chat to the login session
    session_id: { type: Schema.Types.ObjectId, ref: "Session" },
    topic_id: { type: Schema.Types.ObjectId, ref: "Topic" },
    subtopic_id: { type: Schema.Types.ObjectId, ref: "SubTopic" },
    // Fixed: added module_type — was missing
    module_type: {
      type: String,
      enum: ["audio", "video", "text", "exercise", "vocabulary"],
    },
    question: { type: String, required: true },
    answer: { type: String, required: true },
    // Fixed: was 'gpt-4.1' — project uses Mistral not OpenAI
    model: { type: String, default: "llama3.2" },
    tokens_used: { type: Number, default: 0 },
  },
  { timestamps: true },
);

ChatHistorySchema.index({ student_id: 1, createdAt: -1 });
ChatHistorySchema.index({ institute_id: 1, createdAt: -1 });
ChatHistorySchema.index({ session_id: 1 });

module.exports = model("ChatHistory", ChatHistorySchema);
