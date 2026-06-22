const mongoose = require("mongoose");
const { Schema, model } = mongoose;

const TopicSchema = new Schema(
  {
    title: { type: String, required: true, trim: true },
    description: { type: String },
    order: { type: Number, default: 0 },
    created_by: { type: Schema.Types.ObjectId, ref: "Editor", required: true },
    is_active: { type: Boolean, default: true },
  },
  { timestamps: true },
);

TopicSchema.index({ created_by: 1 });
TopicSchema.index({ order: 1 });

module.exports = model("Topic", TopicSchema);
