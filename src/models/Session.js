const mongoose = require("mongoose");
const { Schema, model } = mongoose;

const SessionSchema = new Schema(
  {
    student_id: { type: Schema.Types.ObjectId, ref: "Student", required: true },
    license_id: { type: Schema.Types.ObjectId, ref: "License", required: true },
    institute_id: { type: Schema.Types.ObjectId, ref: "Institute", required: true },
    token: { type: String },
    // Used to tell "same browser, another tab / a double-mount retry" apart
    // from a genuinely different device — only the former should reuse the
    // existing session instead of spending another license seat.
    user_agent: { type: String },
    logged_in_at: { type: Date, default: Date.now },
    expires_at: { type: Date, required: true },
    is_active: { type: Boolean, default: true },
  },
  { timestamps: false },
);

SessionSchema.index({ expires_at: 1, is_active: 1 });
SessionSchema.index({ student_id: 1, is_active: 1 });
SessionSchema.index({ license_id: 1, is_active: 1 });

module.exports = model("Session", SessionSchema);
