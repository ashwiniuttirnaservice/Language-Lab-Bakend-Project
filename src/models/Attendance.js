const mongoose = require("mongoose");
const { Schema, model } = mongoose;

const AttendanceSchema = new Schema(
  {
    student_id: { type: Schema.Types.ObjectId, ref: "Student", required: true },
    institute_id: { type: Schema.Types.ObjectId, ref: "Institute", required: true },
    license_id: { type: Schema.Types.ObjectId, ref: "License", required: true },
    login_time: { type: Date, required: true },
    logout_time: { type: Date, default: null },
    duration_minutes: { type: Number, default: 0 },
    status: { type: String, enum: ["present", "absent"], default: "present" },
    date: { type: Date, default: Date.now },
  },
  { timestamps: true },
);

AttendanceSchema.index({ student_id: 1, date: -1 });
AttendanceSchema.index({ institute_id: 1, date: -1 });

module.exports = model("Attendance", AttendanceSchema);
