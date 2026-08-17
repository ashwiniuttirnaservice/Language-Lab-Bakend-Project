const mongoose = require("mongoose");
const { Schema, model } = mongoose;

const SubjectSchema = new Schema(
  {
    title: { type: String, required: true, trim: true },
    description: { type: String, trim: true },
    is_active: { type: Boolean, default: true },
  },
  { timestamps: true },
);

module.exports = model("Subject", SubjectSchema);
