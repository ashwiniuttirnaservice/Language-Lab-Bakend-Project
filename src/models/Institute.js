const mongoose = require("mongoose");
const { Schema, model } = mongoose;

const InstituteSchema = new Schema(
  {
    institute_name: { type: String, required: true, trim: true },
    institute_code: {
      type: String,
      required: true,
      unique: true,
      uppercase: true,
    },
    logo: { type: String },
    address: {
      line1: { type: String },
      line2: { type: String, default: "" },
      pincode: { type: String },
      state: { type: String },
      city: { type: String },
      autorizedName: { type: String },
      autorizedPhono: { type: String },
      nearbyLandmarks: { type: String },
    },

    email: { type: String, required: true, unique: true, lowercase: true },
    password: { type: String, required: true },
    phone: { type: String },
    website: { type: String },

    // ── Created by super admin ─────────────────────
    created_by: {
      type: Schema.Types.ObjectId,
      ref: "SuperAdmin",
      required: true,
    },

    // ── Courses selected at creation (multiple allowed) ───
    course_id: [{ type: Schema.Types.ObjectId, ref: "Course" }],

    // ── Courses whose content has been pulled/downloaded ──
    // Only courses in here can be assigned to students.
    downloaded_course_ids: [{ type: Schema.Types.ObjectId, ref: "Course" }],

    // ── Licenses (array of all key _ids) ──────────
    license_ids: [{ type: Schema.Types.ObjectId, ref: "License" }],
    license_count: { type: Number, default: 0 },

    role: { type: String, default: "institute", immutable: true },

    // ── Status ─────────────────────────────────────
    max_students: { type: Number, default: 500 },
    is_active: { type: Boolean, default: true },

    // ── Email delivery tracking ────────────────────
    credentials_email_sent_at: { type: Date, default: null },

    // ── OTP (institute-code login flow, e.g. /config) ──
    otp_code: { type: String, select: false },
    otp_expires_at: { type: Date, select: false },
  },
  { timestamps: true },
);

InstituteSchema.index({ created_by: 1 });
module.exports = model("Institute", InstituteSchema);
