const { Types } = require("mongoose");

const Practical = require("../models/Practical");
const PracticalSubmission = require("../models/PracticalSubmission");
const Student = require("../models/Student");
const asyncHandler = require("../middlewares/asyncHandler");
const { sendResponse, sendError } = require("../utils/apiResponse");
const uploadToAws = require("../utils/awsUpload");

const ALLOWED_ATTACHMENT_MIMES = {
  "image/jpeg": "image",
  "image/jpg": "image",
  "image/png": "image",
  "image/webp": "image",
  "image/gif": "image",
  "application/pdf": "pdf",
};
const MAX_ATTACHMENT_BYTES = 10 * 1024 * 1024; // 10 MB

// Re-validates the attachment server-side — the client-side accept/size
// checks are only a UX nicety and must never be trusted alone.
function validateAttachment(file) {
  if (!file) return { error: null, attachment_type: null };

  if (!ALLOWED_ATTACHMENT_MIMES[file.mimetype]) {
    return {
      error: "Attachment must be an image (jpg/png/webp/gif) or a PDF.",
    };
  }
  if (file.size > MAX_ATTACHMENT_BYTES) {
    return { error: "Attachment must be 10 MB or smaller." };
  }
  return { error: null, attachment_type: ALLOWED_ATTACHMENT_MIMES[file.mimetype] };
}

// "File Upload" solutions are specifically a submitted PDF (opened in a new
// tab by the institute reviewer) — unlike Practical's own reference
// attachment, images aren't a valid solution file here.
function validateSubmissionAttachment(file) {
  if (!file) return { error: null };

  if (file.mimetype !== "application/pdf") {
    return { error: "Solution file must be a PDF." };
  }
  if (file.size > MAX_ATTACHMENT_BYTES) {
    return { error: "Solution file must be 10 MB or smaller." };
  }
  return { error: null };
}

// POST /practical
const create = asyncHandler(async (req, res) => {
  const { course_id, topic_id, title, questions } = req.body;
  const instituteId = req.institute._id;

  const courseAssigned = (req.institute.downloaded_course_ids || []).some(
    (id) => id.toString() === course_id,
  );
  if (!courseAssigned) {
    return sendError(
      res,
      400,
      false,
      "This course has not been downloaded by your institute yet.",
    );
  }

  const { error: attachmentError, attachment_type } = validateAttachment(
    req.file,
  );
  if (attachmentError) return sendError(res, 400, false, attachmentError);

  let attachment_url;
  if (req.file) {
    const uploaded = await uploadToAws({
      file: req.file,
      fileName: `practical_${Date.now()}`,
      folderName: "practicals",
    });
    attachment_url = uploaded?.cdnUrl || uploaded?.fullS3URL || "";
  }

  const practical = await Practical.create({
    institute_id: instituteId,
    course_id,
    topic_id: topic_id || undefined,
    title,
    questions,
    attachment_url,
    attachment_type: req.file ? attachment_type : undefined,
    created_by: instituteId,
  });

  return sendResponse(res, 201, true, "Practical question created successfully.", practical);
});

// GET /practical?courseId=&topicId=&page=&limit=
const getAll = asyncHandler(async (req, res) => {
  const match = {
    institute_id: new Types.ObjectId(req.institute._id),
    is_deleted: false,
  };
  if (req.query.courseId) match.course_id = new Types.ObjectId(req.query.courseId);
  if (req.query.topicId) match.topic_id = new Types.ObjectId(req.query.topicId);

  const page = Math.max(1, Number(req.query.page) || 1);
  const limit = Math.min(100, Number(req.query.limit) || 20);

  const [practicals, total] = await Promise.all([
    Practical.find(match)
      .populate("course_id", "course_name course_code")
      .populate("topic_id", "title")
      .sort({ createdAt: -1 })
      .skip((page - 1) * limit)
      .limit(limit)
      .lean(),
    Practical.countDocuments(match),
  ]);

  return sendResponse(res, 200, true, "Practical questions fetched successfully.", {
    total,
    page,
    limit,
    practicals,
  });
});

// GET /practical/:id
const getOne = asyncHandler(async (req, res) => {
  const practical = await Practical.findOne({
    _id: req.params.id,
    institute_id: req.institute._id,
    is_deleted: false,
  })
    .populate("course_id", "course_name course_code")
    .populate("topic_id", "title");

  if (!practical) return sendError(res, 404, false, "Practical question not found.");

  return sendResponse(res, 200, true, "Practical question fetched successfully.", practical);
});

// PUT /practical/:id
const update = asyncHandler(async (req, res) => {
  const practical = await Practical.findOne({
    _id: req.params.id,
    institute_id: req.institute._id,
    is_deleted: false,
  });
  if (!practical) return sendError(res, 404, false, "Practical question not found.");

  const { course_id, topic_id, title, questions, remove_attachment } = req.body;

  if (course_id !== undefined) {
    const courseAssigned = (req.institute.downloaded_course_ids || []).some(
      (id) => id.toString() === course_id,
    );
    if (!courseAssigned) {
      return sendError(
        res,
        400,
        false,
        "This course has not been downloaded by your institute yet.",
      );
    }
    practical.course_id = course_id;
  }
  if (topic_id !== undefined) practical.topic_id = topic_id;
  if (title !== undefined) practical.title = title;
  if (questions !== undefined) practical.questions = questions;

  if (remove_attachment) {
    practical.attachment_url = undefined;
    practical.attachment_type = undefined;
  }

  if (req.file) {
    const { error: attachmentError, attachment_type } = validateAttachment(
      req.file,
    );
    if (attachmentError) return sendError(res, 400, false, attachmentError);

    const uploaded = await uploadToAws({
      file: req.file,
      fileName: `practical_${Date.now()}`,
      folderName: "practicals",
    });
    practical.attachment_url = uploaded?.cdnUrl || uploaded?.fullS3URL || "";
    practical.attachment_type = attachment_type;
  }

  await practical.save();

  return sendResponse(res, 200, true, "Practical question updated successfully.", practical);
});

// PUT /practical/:id/assign
// Adds one department (segment) + batch (year) pair to this manual's
// assigned_batches — same "assign to department/batch" flow as
// studentLearningAccessController's create, but appending rather than
// replacing, so multiple department/batch pairs can be assigned to the same
// manual over separate calls. Silently no-ops on an already-assigned pair.
const assign = asyncHandler(async (req, res) => {
  const practical = await Practical.findOne({
    _id: req.params.id,
    institute_id: req.institute._id,
    is_deleted: false,
  });
  if (!practical) return sendError(res, 404, false, "Practical question not found.");

  const { segment, year } = req.body;

  const alreadyAssigned = practical.assigned_batches.some(
    (b) => b.segment === segment && b.year === year,
  );
  if (!alreadyAssigned) {
    practical.assigned_batches.push({ segment, year });
    await practical.save();
  }

  return sendResponse(res, 200, true, "Practical manual assigned successfully.", practical);
});

// GET /practical/departments
// Distinct department (segment) + batch (year) combinations actually present
// among this institute's students, with live student counts — same shape
// and query as studentLearningAccessController.getDepartments, backing the
// Department/Batch selects on the Assign Practical Manual form.
const getDepartments = asyncHandler(async (req, res) => {
  const groups = await Student.aggregate([
    {
      $match: {
        institute_id: new Types.ObjectId(req.institute._id),
        status: "active",
        segment: { $nin: [null, ""] },
        year: { $ne: null },
      },
    },
    {
      $group: {
        _id: { segment: "$segment", year: "$year" },
        studentCount: { $sum: 1 },
      },
    },
    { $sort: { "_id.segment": 1, "_id.year": 1 } },
  ]);

  const byDepartment = new Map();
  for (const g of groups) {
    const { segment, year } = g._id;
    if (!byDepartment.has(segment)) {
      byDepartment.set(segment, { name: segment, batches: [] });
    }
    byDepartment.get(segment).batches.push({ year, studentCount: g.studentCount });
  }

  return sendResponse(
    res,
    200,
    true,
    "Departments and batches fetched.",
    Array.from(byDepartment.values()),
  );
});

// GET /practical/:id/submissions
const getSubmissions = asyncHandler(async (req, res) => {
  const practical = await Practical.findOne({
    _id: req.params.id,
    institute_id: req.institute._id,
    is_deleted: false,
  }).select("_id");
  if (!practical) return sendError(res, 404, false, "Practical question not found.");

  const submissions = await PracticalSubmission.find({ practical_id: practical._id })
    .populate("student_id", "full_name enrollment_no")
    .sort({ createdAt: -1 })
    .lean();

  return sendResponse(res, 200, true, "Submissions fetched successfully.", {
    total: submissions.length,
    submissions,
  });
});

// PUT /practical/:id/submissions/:submissionId — grade / feedback
const gradeSubmission = asyncHandler(async (req, res) => {
  const practical = await Practical.findOne({
    _id: req.params.id,
    institute_id: req.institute._id,
  }).select("_id");
  if (!practical) return sendError(res, 404, false, "Practical question not found.");

  const submission = await PracticalSubmission.findOne({
    _id: req.params.submissionId,
    practical_id: practical._id,
  });
  if (!submission) return sendError(res, 404, false, "Submission not found.");

  const { marks, feedback } = req.body;

  if (marks !== undefined) submission.marks = marks;
  if (feedback !== undefined) submission.feedback = feedback;
  submission.status = "reviewed";
  submission.reviewed_at = new Date();

  await submission.save();

  return sendResponse(res, 200, true, "Submission updated successfully.", submission);
});

// DELETE /practical/:id
const remove = asyncHandler(async (req, res) => {
  const practical = await Practical.findOneAndUpdate(
    { _id: req.params.id, institute_id: req.institute._id, is_deleted: false },
    { $set: { is_deleted: true } },
    { new: true },
  );
  if (!practical) return sendError(res, 404, false, "Practical question not found.");

  return sendResponse(res, 200, true, "Practical question deleted successfully.");
});

// ── Student Panel ────────────────────────────────────────────────────────
// answer_key_html is the institute's own model answer — never shown to the
// student attempting the practical, only used for institute-side grading.
const STUDENT_HIDDEN_FIELDS = "-questions.answer_key_html";

// GET /practical/mine?courseId=&topicId=
const getMine = asyncHandler(async (req, res) => {
  const student = req.student;
  const match = {
    institute_id: student.institute_id,
    is_deleted: false,
    course_id: { $in: student.purchased_courses },
  };
  if (req.query.courseId) match.course_id = new Types.ObjectId(req.query.courseId);
  if (req.query.topicId) match.topic_id = new Types.ObjectId(req.query.topicId);

  let practicals = await Practical.find(match)
    .select(STUDENT_HIDDEN_FIELDS)
    .populate("course_id", "course_name course_code")
    .populate("topic_id", "title")
    .sort({ createdAt: -1 })
    .lean();

  // A manual with no assigned_batches is visible to every enrolled student
  // (backward compatible with manuals created before assignment existed);
  // once assigned, it's only visible to students in one of its assigned
  // department/batch pairs.
  practicals = practicals.filter(
    (p) =>
      !p.assigned_batches?.length ||
      p.assigned_batches.some((b) => b.segment === student.segment && b.year === student.year),
  );

  const submissions = await PracticalSubmission.find({
    student_id: student._id,
    practical_id: { $in: practicals.map((p) => p._id) },
  }).lean();
  const submissionMap = {};
  submissions.forEach((s) => {
    submissionMap[s.practical_id.toString()] = s;
  });

  const result = practicals.map((p) => {
    const sub = submissionMap[p._id.toString()];
    return {
      ...p,
      my_submission: sub
        ? { status: sub.status, marks: sub.marks, submitted_at: sub.submitted_at }
        : null,
    };
  });

  return sendResponse(res, 200, true, "Practicals fetched successfully.", {
    total: result.length,
    practicals: result,
  });
});

// GET /practical/mine/:id
const getOneMine = asyncHandler(async (req, res) => {
  const student = req.student;
  const practical = await Practical.findOne({
    _id: req.params.id,
    institute_id: student.institute_id,
    is_deleted: false,
  })
    .select(STUDENT_HIDDEN_FIELDS)
    .populate("course_id", "course_name course_code")
    .populate("topic_id", "title");

  if (!practical) return sendError(res, 404, false, "Practical not found.");

  const enrolled = student.purchased_courses.some(
    (c) => c.toString() === practical.course_id._id.toString(),
  );
  if (!enrolled) {
    return sendError(res, 403, false, "You are not enrolled in this practical's course.");
  }

  const assignedElsewhere =
    practical.assigned_batches?.length &&
    !practical.assigned_batches.some(
      (b) => b.segment === student.segment && b.year === student.year,
    );
  if (assignedElsewhere) {
    return sendError(res, 403, false, "This practical is not assigned to your department/batch.");
  }

  const submission = await PracticalSubmission.findOne({
    practical_id: practical._id,
    student_id: student._id,
  }).lean();

  return sendResponse(res, 200, true, "Practical fetched successfully.", {
    ...practical.toObject(),
    my_submission: submission || null,
  });
});

// POST /practical/mine/:id/submit
const submitMine = asyncHandler(async (req, res) => {
  const student = req.student;
  const practical = await Practical.findOne({
    _id: req.params.id,
    institute_id: student.institute_id,
    is_deleted: false,
  });
  if (!practical) return sendError(res, 404, false, "Practical not found.");

  const enrolled = student.purchased_courses.some(
    (c) => c.toString() === practical.course_id.toString(),
  );
  if (!enrolled) {
    return sendError(res, 403, false, "You are not enrolled in this practical's course.");
  }

  const { answers, solution_type = "text" } = req.body;
  const validQuestionIds = new Set(practical.questions.map((q) => q._id.toString()));
  const invalid = (answers || []).find((a) => !validQuestionIds.has(a.question_id));
  if (invalid) {
    return sendError(
      res,
      400,
      false,
      "One or more answers reference a question that doesn't belong to this practical.",
    );
  }

  const files = req.files || [];
  const wholeManualFile = files.find((f) => f.fieldname === "practicalSubmissionAttachment");
  const questionFiles = files.filter((f) => f.fieldname.startsWith("question_file_"));

  const { error: attachmentError } = validateSubmissionAttachment(wholeManualFile);
  if (attachmentError) return sendError(res, 400, false, attachmentError);

  // Student submissions are kept on this server's own disk (see
  // uploads.js's getFolderPath → "uploads/practical-submissions") instead of
  // AWS — multer already wrote the file there, so this just points the DB
  // record at it via the static route mounted in server.js. No network call
  // out to the AWS upload proxy means no "Failed to upload file to AWS"
  // failure when a student's connection drops mid-submit.
  let attachment_url;
  if (wholeManualFile) {
    attachment_url = `/media/practical-submissions/${wholeManualFile.filename}`;
  }

  if (solution_type === "file" && !attachment_url) {
    const existing = await PracticalSubmission.findOne({
      practical_id: practical._id,
      student_id: student._id,
    }).select("attachment_url");
    if (!existing?.attachment_url) {
      return sendError(res, 400, false, "Please upload a PDF solution file.");
    }
  }

  // Merge per-question file uploads into their matching answer entry — each
  // question's own solution_type ("text" vs "file") decides whether it was
  // ever going to have a file here, independent of the whole-manual toggle.
  const answerByQid = {};
  (answers || []).forEach((a) => {
    answerByQid[a.question_id] = { ...a };
  });

  for (const qf of questionFiles) {
    const questionId = qf.fieldname.replace("question_file_", "");
    if (!validQuestionIds.has(questionId)) continue;

    answerByQid[questionId] = {
      ...(answerByQid[questionId] || { question_id: questionId }),
      answer_file_url: `/media/practical-submissions/${qf.filename}`,
    };
  }

  const mergedAnswers = Object.values(answerByQid);

  const submission = await PracticalSubmission.findOneAndUpdate(
    { practical_id: practical._id, student_id: student._id },
    {
      $set: {
        answers: solution_type === "file" ? [] : mergedAnswers,
        solution_type,
        ...(attachment_url && { attachment_url }),
        status: "submitted",
        submitted_at: new Date(),
      },
    },
    { new: true, upsert: true, setDefaultsOnInsert: true },
  );

  return sendResponse(res, 200, true, "Practical submitted successfully.", submission);
});

module.exports = {
  create,
  getAll,
  getOne,
  update,
  remove,
  assign,
  getDepartments,
  getSubmissions,
  gradeSubmission,
  getMine,
  getOneMine,
  submitMine,
};
