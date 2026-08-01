const mongoose = require("mongoose");
const { Schema, model } = mongoose;

const StudentSchema = new Schema(
  {
    // ── Login ──────────────────────────────────────
    full_name: { type: String, required: true, trim: true },
    // email is optional — login uses enrollment_no, not email
    email: { type: String, unique: true, sparse: true, lowercase: true },
    // login = institute + enrollment_no + password. If not set explicitly at
    // creation, controllers default this to enrollment_no. Stored as PLAIN
    // TEXT (not hashed) so institute staff can always look up and return the
    // real current password via the API.
    password: { type: String },
    role: { type: String, default: "student", immutable: true },
    phone: { type: String },
    profilePhoto: { type: String },

    // ── Institute ──────────────────────────────────
    institute_id: {
      type: Schema.Types.ObjectId,
      ref: "Institute",
      required: true,
    },
    student_excel: { type: String }, // bulk upload excel file path

    // ── Enrollment ─────────────────────────────────
    roll_no: { type: String, required: true },
    enrollment_no: { type: String, unique: true, sparse: true },
    segment: { type: String },
    year: { type: Number },

    // ── License ────────────────────────────────────
    license_id: { type: Schema.Types.ObjectId, ref: "License" },

    // ── Purchased / enrolled courses ───────────────
    purchased_courses: [{ type: Schema.Types.ObjectId, ref: "Course" }],

    // ── Progress & Attendance refs ─────────────────
    attendance_id: { type: Schema.Types.ObjectId, ref: "Attendance" },
    progress_id: { type: Schema.Types.ObjectId, ref: "StudentProgress" },

    // ── Status ─────────────────────────────────────
    is_active: { type: Boolean, default: true },
    last_login: { type: Date },
    // Updated by POST /activity/heartbeat — powers the institute dashboard's
    // "Active Now" tile (last_seen_at within the last few minutes).
    last_seen_at: { type: Date },
    status: {
      type: String,
      enum: ["active", "inactive", "suspended"],
      default: "active",
    },
  },
  { timestamps: true },
);

StudentSchema.methods.comparePassword = function comparePassword(plain) {
  if (!this.password) return Promise.resolve(false);
  return Promise.resolve(plain === this.password);
};

StudentSchema.index({ institute_id: 1, status: 1 });
StudentSchema.index({ roll_no: 1, institute_id: 1 });
StudentSchema.index({ enrollment_no: 1 });
StudentSchema.index({ license_id: 1 });

module.exports = model("Student", StudentSchema);
