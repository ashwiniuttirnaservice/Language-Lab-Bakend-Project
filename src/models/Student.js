const mongoose = require("mongoose");
const { Schema, model } = mongoose;

const StudentSchema = new Schema(
  {
    // ── Login ──────────────────────────────────────
    full_name: { type: String, required: true, trim: true },
    // email is optional — login uses enrollment_no, not email
    email: { type: String, unique: true, sparse: true, lowercase: true },
    // password not required — login is enrollment_no ONLY (no password check)
    password: { type: String },
    role: { type: String, default: "student", immutable: true },
    phone: { type: String },
    profilePhoto: { type: String },

    // ── Institute ──────────────────────────────────
    institute_id: { type: Schema.Types.ObjectId, ref: "Institute", required: true },
    student_excel: { type: String }, // bulk upload excel file path

    // ── Enrollment ─────────────────────────────────
    roll_no: { type: String, required: true },
    enrollment_no: { type: String, unique: true, sparse: true },
    batch: { type: String },
    course: { type: String },
    year: { type: Number },

    // ── License ────────────────────────────────────
    license_id: { type: Schema.Types.ObjectId, ref: "License" },

    // ── Progress & Attendance refs ─────────────────
    // ✅ FIXED: was ref: 'College' for both — WRONG
    attendance_id: { type: Schema.Types.ObjectId, ref: "Attendance" },
    progress_id: { type: Schema.Types.ObjectId, ref: "StudentProgress" },

    // ── Status ─────────────────────────────────────
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

StudentSchema.index({ institute_id: 1, status: 1 });
StudentSchema.index({ roll_no: 1, institute_id: 1 });
StudentSchema.index({ enrollment_no: 1 });
StudentSchema.index({ license_id: 1 });

module.exports = model("Student", StudentSchema);
