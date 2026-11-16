const Teacher = require("../models/Teacher");
const asyncHandler = require("../middlewares/asyncHandler");
const { sendResponse, sendError } = require("../utils/apiResponse");
const bcrypt = require("bcryptjs");

// GET /api/institute/teachers
const getTeachers = asyncHandler(async (req, res) => {
  const query = { institute_id: req.institute._id };

  if (req.query.status && req.query.status !== "all") {
    query.status = req.query.status;
  }

  const teachers = await Teacher.find(query).sort({ createdAt: -1 });

  return sendResponse(res, 200, true, "Teachers fetched successfully.", teachers);
});

// POST /api/institute/teachers
const createTeacher = asyncHandler(async (req, res) => {
  const {
    full_name,
    email,
    password,
    phone,
    assigned_departments = [],
    assigned_batches = [],
    assigned_courses = [],
    status = "active",
  } = req.body;

  if (!full_name || !email || !password) {
    return sendError(res, 400, false, "Full name, email, and password are required.");
  }

  const normalizedEmail = email.toLowerCase().trim();

  // Prevent using the institute administrator email for a faculty account
  if (
    req.institute?.email &&
    req.institute.email.toLowerCase().trim() === normalizedEmail
  ) {
    return sendError(
      res,
      400,
      false,
      "Cannot register a faculty account with the institute administrator email.",
    );
  }

  // Check if teacher email already exists for this institute
  const existingTeacher = await Teacher.findOne({
    email: normalizedEmail,
    institute_id: req.institute._id,
  });
  if (existingTeacher) {
    return sendError(
      res,
      400,
      false,
      "Faculty with this email already exists in this institute.",
    );
  }

  const teacher = await Teacher.create({
    institute_id: req.institute._id,
    full_name: full_name.trim(),
    email: normalizedEmail,
    password,
    phone: phone ? phone.trim() : "",
    assigned_departments: Array.isArray(assigned_departments) ? assigned_departments : [],
    assigned_batches: Array.isArray(assigned_batches) ? assigned_batches : [],
    assigned_courses: Array.isArray(assigned_courses) ? assigned_courses : [],
    status,
  });

  return sendResponse(res, 201, true, "Faculty registered successfully.", teacher);
});

// PUT /api/institute/teachers/:id
const updateTeacher = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const {
    full_name,
    email,
    phone,
    password,
    assigned_departments,
    assigned_batches,
    assigned_courses,
    status,
  } = req.body;

  const teacher = await Teacher.findOne({ _id: id, institute_id: req.institute._id });
  if (!teacher) {
    return sendError(res, 404, false, "Faculty member not found.");
  }

  if (full_name) teacher.full_name = full_name.trim();
  if (phone !== undefined) teacher.phone = phone.trim();
  if (status) teacher.status = status;
  if (Array.isArray(assigned_departments)) teacher.assigned_departments = assigned_departments;
  if (Array.isArray(assigned_batches)) teacher.assigned_batches = assigned_batches;
  if (Array.isArray(assigned_courses)) teacher.assigned_courses = assigned_courses;

  if (email && email.toLowerCase().trim() !== teacher.email) {
    const normalizedNewEmail = email.toLowerCase().trim();

    if (
      req.institute?.email &&
      req.institute.email.toLowerCase().trim() === normalizedNewEmail
    ) {
      return sendError(
        res,
        400,
        false,
        "Cannot use the institute administrator email for a faculty account.",
      );
    }

    const existing = await Teacher.findOne({
      email: normalizedNewEmail,
      institute_id: req.institute._id,
      _id: { $ne: teacher._id },
    });
    if (existing) {
      return sendError(
        res,
        400,
        false,
        "Email is already taken by another faculty member in this institute.",
      );
    }
    teacher.email = normalizedNewEmail;
  }

  if (password && password.trim()) {
    teacher.password = password.trim();
  }

  await teacher.save();

  return sendResponse(res, 200, true, "Faculty updated successfully.", teacher);
});

// DELETE /api/institute/teachers/:id
const deleteTeacher = asyncHandler(async (req, res) => {
  const { id } = req.params;

  const teacher = await Teacher.findOneAndDelete({
    _id: id,
    institute_id: req.institute._id,
  });

  if (!teacher) {
    return sendError(res, 404, false, "Faculty member not found.");
  }

  return sendResponse(res, 200, true, "Faculty account removed successfully.");
});

// PATCH /api/institute/teachers/:id/toggle-status
const toggleTeacherStatus = asyncHandler(async (req, res) => {
  const { id } = req.params;

  const teacher = await Teacher.findOne({ _id: id, institute_id: req.institute._id });
  if (!teacher) {
    return sendError(res, 404, false, "Faculty member not found.");
  }

  teacher.status = teacher.status === "active" ? "inactive" : "active";
  await teacher.save();

  return sendResponse(res, 200, true, `Faculty status updated to ${teacher.status}.`, teacher);
});

// POST /api/institute/teachers/:id/reset-password
const resetTeacherPassword = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const { password } = req.body;

  if (!password || !password.trim()) {
    return sendError(res, 400, false, "New password is required.");
  }

  const teacher = await Teacher.findOne({ _id: id, institute_id: req.institute._id });
  if (!teacher) {
    return sendError(res, 404, false, "Faculty member not found.");
  }

  teacher.password = password.trim();
  await teacher.save();

  return sendResponse(res, 200, true, "Password reset successfully.");
});

module.exports = {
  getTeachers,
  createTeacher,
  updateTeacher,
  deleteTeacher,
  toggleTeacherStatus,
  resetTeacherPassword,
};
