const mongoose = require("mongoose");
const { Schema, model } = mongoose;
const bcrypt = require("bcryptjs");

const TeacherSchema = new Schema(
  {
    institute_id: {
      type: Schema.Types.ObjectId,
      ref: "Institute",
      required: true,
      index: true,
    },
    full_name: {
      type: String,
      required: true,
      trim: true,
    },
    email: {
      type: String,
      required: true,
      lowercase: true,
      trim: true,
    },
    password: {
      type: String,
      required: true,
    },
    phone: {
      type: String,
      trim: true,
    },
    role: {
      type: String,
      default: "faculty",
      immutable: true,
    },
    // e.g. ["Diploma", "Mechanical"]
    assigned_departments: [{ type: String, trim: true }],
    // Can be numbers (legacy [1, 2]) or department-scoped objects [{ department: "Computer", batch: 1 }]
    assigned_batches: [{ type: Schema.Types.Mixed }],
    // e.g. ["COMMUNICATION SKILLS"]
    assigned_courses: [{ type: String, trim: true }],
    status: {
      type: String,
      enum: ["active", "inactive"],
      default: "active",
    },
    last_login: {
      type: Date,
      default: null,
    },
  },
  { timestamps: true },
);

TeacherSchema.index({ email: 1, institute_id: 1 }, { unique: true });

// Stored as plain text (matching Student.js) so Institute Admin can view & copy credentials for faculty
TeacherSchema.methods.comparePassword = function (enteredPassword) {
  if (!this.password) return Promise.resolve(false);
  // Support bcrypt hash (for any legacy records) as well as direct plain text match
  if (this.password.startsWith("$2a$") || this.password.startsWith("$2b$")) {
    return bcrypt.compare(enteredPassword, this.password);
  }
  return Promise.resolve(this.password === enteredPassword);
};

module.exports = model("Teacher", TeacherSchema);
