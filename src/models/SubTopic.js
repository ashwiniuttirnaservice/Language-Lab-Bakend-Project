const mongoose = require("mongoose");
const { Schema, model } = mongoose;

const SubTopicSchema = new Schema(
  {
    topic_id: { type: Schema.Types.ObjectId, ref: "Topic", required: true },
    title: { type: String, required: true, trim: true },
    description: { type: String },
    order: { type: Number, default: 0 },
    created_by: { type: Schema.Types.ObjectId, ref: "Editor", required: true },
    is_active: { type: Boolean, default: true },
  },
  { timestamps: true },
);

SubTopicSchema.index({ topic_id: 1, order: 1 });
SubTopicSchema.index({ created_by: 1 });

module.exports = model("SubTopic", SubTopicSchema);
