const mongoose = require("mongoose");
const { Schema, model } = mongoose;

const EditorSchema = new Schema(
  {
    full_name: { type: String, required: true, trim: true },
    email: { type: String, required: true, unique: true, lowercase: true },
    password: { type: String, required: true },
    role: { type: String, default: "editor", immutable: true },
    phone: { type: String },
    profilePhoto: { type: String },

    created_by: {
      type: Schema.Types.ObjectId,
      ref: "SuperAdmin",
      required: true,
    },

    is_active: { type: Boolean, default: true },
    last_login: { type: Date },
    status: {
      type: String,
      enum: ["active", "inactive", "suspended"],
      default: "active",
    },
  },
  { timestamps: true },
);

EditorSchema.index({ created_by: 1 });

module.exports = model("Editor", EditorSchema);
