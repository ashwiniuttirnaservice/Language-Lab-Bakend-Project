const xlsx = require("xlsx");
const Assessment = require("../models/Assessment");
const Subject = require("../models/Subject");
const asyncHandler = require("../middlewares/asyncHandler");
const { sendResponse, sendError } = require("../utils/apiResponse");

// POST /api/assessment
const create = asyncHandler(async (req, res) => {
  const {
    subject_id,
    title,
    description,
    order,
    exercise_type,
    difficulty,
    questions,
    shuffle_questions,
    shuffle_options,
    show_explanation,
    total_marks,
    time_limit_sec,
    max_attempts,
    userType,
  } = req.body;

  const assessment = await Assessment.create({
    subject_id,
    title,
    description,
    order,
    exercise_type,
    difficulty,
    questions,
    shuffle_questions,
    shuffle_options,
    show_explanation,
    total_marks,
    time_limit_sec,
    max_attempts,
    userType,
    created_by: req.admin?._id || req.institute?._id,
  });

  return sendResponse(res, 201, true, "Assessment created successfully.", assessment);
});

// GET /api/assessment?subject_id=xxx — multiple assessments under one subject
// Stays open (no required auth) so both the admin panel and the student
// panel hit the same endpoint — optionalAuth (see routes) sets req.student
// when a valid student token is present, and only then is the list filtered
// down to userType "1" (Shown). Admin/institute/no-token callers keep seeing
// everything, same as before, so the manage screen can still toggle hidden ones.
const getAll = asyncHandler(async (req, res) => {
  const filter = { is_active: true };
  if (req.query.subject_id) filter.subject_id = req.query.subject_id;
  if (req.student) filter.userType = "1";

  const assessments = await Assessment.find(filter)
    .sort({ order: 1, createdAt: -1 })
    .select("-__v")
    .populate("subject_id", "title");

  return sendResponse(res, 200, true, "Assessments fetched successfully.", assessments);
});

// GET /api/assessment/:id
const getOne = asyncHandler(async (req, res) => {
  const assessment = await Assessment.findById(req.params.id).populate("subject_id", "title");
  if (!assessment) return sendError(res, 404, false, "Assessment not found.");
  if (req.student && assessment.userType !== "1")
    return sendError(res, 404, false, "Assessment not found.");

  return sendResponse(res, 200, true, "Assessment fetched successfully.", assessment);
});

// PUT /api/assessment/:id
const update = asyncHandler(async (req, res) => {
  const assessment = await Assessment.findById(req.params.id);
  if (!assessment) return sendError(res, 404, false, "Assessment not found.");

  const fields = [
    "title",
    "description",
    "order",
    "exercise_type",
    "difficulty",
    "questions",
    "shuffle_questions",
    "shuffle_options",
    "show_explanation",
    "total_marks",
    "time_limit_sec",
    "max_attempts",
    "userType",
    "is_active",
  ];

  fields.forEach((field) => {
    if (req.body[field] !== undefined) assessment[field] = req.body[field];
  });

  await assessment.save();

  return sendResponse(res, 200, true, "Assessment updated successfully.", assessment);
});

// DELETE /api/assessment/:id
const remove = asyncHandler(async (req, res) => {
  const assessment = await Assessment.findById(req.params.id);
  if (!assessment) return sendError(res, 404, false, "Assessment not found.");

  assessment.is_active = false;
  await assessment.save();

  return sendResponse(res, 200, true, "Assessment deactivated successfully.");
});

// POST /api/assessment/bulk-upload
// Excel columns (header row required):
//   subject_title, title, description, exercise_type, difficulty,
//   question_text, optionA, optionB, optionC, optionD, correct_answer,
//   explanation, hint, marks, negative_marks
// One row = one MCQ question. "subject_title" must match an existing
// Subject's title exactly (case-insensitive) — no need to know its _id.
// Rows sharing the same subject_title + title are grouped into a single
// Assessment with multiple questions — if an active assessment with that
// subject + title already exists, the parsed questions are appended to it
// instead of creating a duplicate.
const bulkUpload = asyncHandler(async (req, res) => {
  if (!req.file) return sendError(res, 400, false, "Excel file is required.");

  const workbook = xlsx.readFile(req.file.path);
  const sheet = workbook.Sheets[workbook.SheetNames[0]];
  const rows = xlsx.utils.sheet_to_json(sheet, { defval: "" });

  if (!rows.length) return sendError(res, 400, false, "Excel file is empty.");

  const groups = new Map(); // "subject_title||title" -> { subject_title, title, ...meta, questions[] }
  const failed = [];

  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];
    const rowNum = i + 2;

    const subject_title = String(
      row["subject_title"] || row["Subject Title"] || row["Subject"] || "",
    ).trim();
    const title = String(row["title"] || row["Title"] || "").trim();
    const question_text = String(row["question_text"] || row["Question Text"] || "").trim();
    const correct_answer = String(row["correct_answer"] || row["Correct Answer"] || "").trim();
    const optionA = String(row["optionA"] || row["Option A"] || "").trim();
    const optionB = String(row["optionB"] || row["Option B"] || "").trim();

    if (!subject_title || !title || !question_text || !correct_answer || !optionA || !optionB) {
      failed.push({
        row: rowNum,
        reason:
          "subject_title, title, question_text, optionA, optionB and correct_answer are required",
      });
      continue;
    }

    const key = `${subject_title.toLowerCase()}||${title}`;
    if (!groups.has(key)) {
      groups.set(key, {
        subject_title,
        title,
        description: String(row["description"] || row["Description"] || "").trim(),
        exercise_type: String(row["exercise_type"] || row["Exercise Type"] || "assessment").trim(),
        difficulty: String(row["difficulty"] || row["Difficulty"] || "easy").trim(),
        questions: [],
      });
    }

    groups.get(key).questions.push({
      question_text,
      optionA,
      optionB,
      optionC: String(row["optionC"] || row["Option C"] || "").trim(),
      optionD: String(row["optionD"] || row["Option D"] || "").trim(),
      correct_answer,
      explanation: String(row["explanation"] || row["Explanation"] || "").trim() || undefined,
      hint: String(row["hint"] || row["Hint"] || "").trim() || undefined,
      marks: Number(row["marks"] || row["Marks"]) || 1,
      negative_marks: Number(row["negative_marks"] || row["Negative Marks"]) || 0,
    });
  }

  const created = [];
  const updated = [];

  for (const group of groups.values()) {
    try {
      const subject = await Subject.findOne({
        title: new RegExp(`^${group.subject_title.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}$`, "i"),
        is_active: true,
      }).select("_id");
      if (!subject) {
        failed.push({ subject_title: group.subject_title, title: group.title, reason: "Subject not found" });
        continue;
      }

      let assessment = await Assessment.findOne({
        subject_id: subject._id,
        title: group.title,
        is_active: true,
      });

      if (assessment) {
        assessment.questions.push(...group.questions);
        await assessment.save();
        updated.push({ id: assessment._id, title: assessment.title, questions_added: group.questions.length });
      } else {
        assessment = await Assessment.create({
          subject_id: subject._id,
          title: group.title,
          description: group.description || undefined,
          exercise_type: group.exercise_type,
          difficulty: group.difficulty,
          questions: group.questions,
          created_by: req.admin?._id || req.institute?._id,
        });
        created.push({ id: assessment._id, title: assessment.title, questions: group.questions.length });
      }
    } catch (err) {
      failed.push({ title: group.title, subject_title: group.subject_title, reason: err.message });
    }
  }

  if (created.length === 0 && updated.length === 0) {
    return sendError(res, 400, false, "Bulk upload failed. No assessments were created.", {
      total_rows: rows.length,
      errors: failed,
    });
  }

  const message = `Bulk upload complete. ${created.length} assessment(s) created, ${updated.length} updated${
    failed.length ? `, ${failed.length} row(s)/group(s) failed` : ""
  }.`;

  return sendResponse(res, 201, true, message, {
    total_rows: rows.length,
    created,
    updated,
    errors: failed,
  });
});

module.exports = { create, getAll, getOne, update, remove, bulkUpload };
