const { Types } = require("mongoose");

const Attendance = require("../models/Attendance");
const asyncHandler = require("../middlewares/asyncHandler");
const { sendResponse } = require("../utils/apiResponse");

// GET /attendance/me — student's own attendance
const getMyAttendance = asyncHandler(async (req, res) => {
  const { from, to } = req.query;

  const matchStage = { student_id: new Types.ObjectId(req.student._id) };
  if (from || to) {
    matchStage.date = {};
    if (from) matchStage.date.$gte = new Date(from);
    if (to) matchStage.date.$lte = new Date(to);
  }

  const records = await Attendance.find(matchStage).sort({ date: -1 });

  const summary = {
    total_days: records.length,
    present: records.filter((r) => r.status === "present").length,
    absent: records.filter((r) => r.status === "absent").length,
  };

  return sendResponse(res, 200, true, "Attendance fetched successfully.", {
    summary,
    records,
  });
});

// GET /attendance/student/:id — teacher/college views a student's attendance
const getStudentAttendance = asyncHandler(async (req, res) => {
  const { from, to } = req.query;

  const matchStage = { student_id: new Types.ObjectId(req.params.id) };
  if (from || to) {
    matchStage.date = {};
    if (from) matchStage.date.$gte = new Date(from);
    if (to) matchStage.date.$lte = new Date(to);
  }

  const records = await Attendance.find(matchStage).sort({ date: -1 });

  const summary = {
    total_days: records.length,
    present: records.filter((r) => r.status === "present").length,
    absent: records.filter((r) => r.status === "absent").length,
    attendance_percent:
      records.length > 0
        ? Math.round(
            (records.filter((r) => r.status === "present").length / records.length) * 100,
          )
        : 0,
  };

  return sendResponse(res, 200, true, "Attendance fetched successfully.", {
    summary,
    records,
  });
});

// GET /attendance/institute — institute views all students' attendance summary
const getInstituteAttendance = asyncHandler(async (req, res) => {
  const { date } = req.query;

  const matchStage = { institute_id: new Types.ObjectId(req.institute._id) };
  if (date) {
    const d = new Date(date);
    d.setHours(0, 0, 0, 0);
    matchStage.date = d;
  }

  const records = await Attendance.aggregate([
    { $match: matchStage },
    { $sort: { date: -1 } },
    {
      $lookup: {
        from: "students",
        localField: "student_id",
        foreignField: "_id",
        as: "student",
        pipeline: [{ $project: { full_name: 1, roll_no: 1, course: 1 } }],
      },
    },
    { $unwind: { path: "$student", preserveNullAndEmptyArrays: true } },
  ]);

  return sendResponse(res, 200, true, "Attendance fetched successfully.", records);
});

module.exports = { getMyAttendance, getStudentAttendance, getInstituteAttendance };
