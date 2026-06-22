const Course = require("../models/Course");
const asyncHandler = require("../middlewares/asyncHandler");
const { sendResponse, sendError } = require("../utils/apiResponse");

// POST /api/super-admin/course
const create = asyncHandler(async (req, res) => {
  const { course_name, course_code, description, level, language, duration_days } = req.body;

  const existing = await Course.findOne({ course_code: course_code.toUpperCase() });
  if (existing) return sendError(res, 409, false, "Course code already exists.");

  const course = await Course.create({
    course_name,
    course_code: course_code.toUpperCase(),
    description,
    level,
    language,
    duration_days,
    created_by: req.admin._id,
  });

  return sendResponse(res, 201, true, "Course created successfully.", course);
});

// GET /api/super-admin/course
const getAll = asyncHandler(async (req, res) => {
  const courses = await Course.find({ is_active: true })
    .sort({ createdAt: -1 })
    .select("-__v");

  return sendResponse(res, 200, true, "Courses fetched successfully.", courses);
});

// GET /api/super-admin/course/:id
const getOne = asyncHandler(async (req, res) => {
  const course = await Course.findById(req.params.id);
  if (!course) return sendError(res, 404, false, "Course not found.");

  return sendResponse(res, 200, true, "Course fetched successfully.", course);
});

// PUT /api/super-admin/course/:id
const update = asyncHandler(async (req, res) => {
  const course = await Course.findById(req.params.id);
  if (!course) return sendError(res, 404, false, "Course not found.");

  const { course_name, description, level, language, duration_days, is_active, topic_ids } = req.body;

  if (course_name !== undefined) course.course_name = course_name;
  if (description !== undefined) course.description = description;
  if (level !== undefined) course.level = level;
  if (language !== undefined) course.language = language;
  if (duration_days !== undefined) course.duration_days = duration_days;
  if (is_active !== undefined) course.is_active = is_active;

  // Assign topics to this course — replaces the full topic_ids[] array
  if (topic_ids !== undefined) {
    course.topic_ids = Array.isArray(topic_ids) ? topic_ids : [topic_ids];
  }

  await course.save();

  return sendResponse(res, 200, true, "Course updated successfully.", course);
});

// DELETE /api/super-admin/course/:id
const remove = asyncHandler(async (req, res) => {
  const course = await Course.findById(req.params.id);
  if (!course) return sendError(res, 404, false, "Course not found.");

  course.is_active = false;
  await course.save();

  return sendResponse(res, 200, true, "Course deactivated successfully.");
});

module.exports = { create, getAll, getOne, update, remove };
