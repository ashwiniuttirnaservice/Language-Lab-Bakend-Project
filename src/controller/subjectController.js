const Subject = require("../models/Subject");
const asyncHandler = require("../middlewares/asyncHandler");
const { sendResponse, sendError } = require("../utils/apiResponse");

// POST /api/super-admin/subject
const create = asyncHandler(async (req, res) => {
  const { title, description } = req.body;

  const subject = await Subject.create({ title, description });

  return sendResponse(res, 201, true, "Subject created successfully.", subject);
});

// GET /api/super-admin/subject | /api/institute/subject
const getAll = asyncHandler(async (req, res) => {
  const subjects = await Subject.find({ is_active: true })
    .sort({ createdAt: -1 })
    .select("-__v");

  return sendResponse(res, 200, true, "Subjects fetched successfully.", subjects);
});

// GET /api/super-admin/subject/:id | /api/institute/subject/:id
const getOne = asyncHandler(async (req, res) => {
  const subject = await Subject.findById(req.params.id);
  if (!subject) return sendError(res, 404, false, "Subject not found.");

  return sendResponse(res, 200, true, "Subject fetched successfully.", subject);
});

// PUT /api/super-admin/subject/:id
const update = asyncHandler(async (req, res) => {
  const subject = await Subject.findById(req.params.id);
  if (!subject) return sendError(res, 404, false, "Subject not found.");

  const { title, description, is_active } = req.body;

  if (title !== undefined) subject.title = title;
  if (description !== undefined) subject.description = description;
  if (is_active !== undefined) subject.is_active = is_active;

  await subject.save();

  return sendResponse(res, 200, true, "Subject updated successfully.", subject);
});

// DELETE /api/super-admin/subject/:id
const remove = asyncHandler(async (req, res) => {
  const subject = await Subject.findById(req.params.id);
  if (!subject) return sendError(res, 404, false, "Subject not found.");

  subject.is_active = false;
  await subject.save();

  return sendResponse(res, 200, true, "Subject deactivated successfully.");
});

module.exports = { create, getAll, getOne, update, remove };
