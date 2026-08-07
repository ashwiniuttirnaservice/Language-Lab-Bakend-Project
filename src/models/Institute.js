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

    // ── Snapshot of each downloaded course's topic_ids, taken at the moment
    // of that pull. Students only see topics captured in this snapshot —
    // topics added to the course afterward stay hidden until the institute
    // downloads/updates that course again ("Update Data").
    downloaded_topic_snapshot: [
      {
        _id: false,
        course_id: { type: Schema.Types.ObjectId, ref: "Course", required: true },
        topic_ids: [{ type: Schema.Types.ObjectId, ref: "Topic" }],
      },
    ],

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

    // ── Master→local course sync ───────────────────
    // Lets THIS institute's own local backend (its own separate database,
    // e.g. a MongoDB running on its own premises) pull course content from
    // this (master) server over HTTP — see routes/syncRoutes.js. Never a
    // database credential; only ever sent as a header, and only this one
    // institute's data is reachable with it. select: false because it's
    // effectively a secret, same treatment as otp_code above.
    sync_api_key: { type: String, select: false, unique: true, sparse: true },
  },
  { timestamps: true },
);

InstituteSchema.index({ created_by: 1 });
module.exports = model("Institute", InstituteSchema);
