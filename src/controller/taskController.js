const { Types } = require("mongoose");

const Task = require("../models/Task");
const TaskSubmission = require("../models/TaskSubmission");
const Student = require("../models/Student");
const asyncHandler = require("../middlewares/asyncHandler");
const { sendResponse, sendError } = require("../utils/apiResponse");
const uploadToAws = require("../utils/awsUpload");

// POST /task
const create = asyncHandler(async (req, res) => {
  const {
    course_id,
    topic_id,
    title,
    description,
    instructions,
    type,
    link_url,
    text_content,
    target,
    student_ids,
    due_date,
    status,
    questions,
  } = req.body;
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

  // Media-bearing types need an uploaded file; link/text carry their content
  // directly in the request body instead.
  const mediaTypes = ["audio", "video", "document"];
  let media_url;
  if (mediaTypes.includes(type)) {
    if (!req.file) {
      return sendError(res, 400, false, `A file upload is required for task type '${type}'.`);
    }
    const uploaded = await uploadToAws({
      file: req.file,
      fileName: `task_${Date.now()}`,
      folderName: "tasks",
    });
    media_url = uploaded?.cdnUrl || uploaded?.fullS3URL || "";
  }

  // Every id in student_ids must belong to this institute AND be enrolled in course_id.
  if (target === "selected") {
    const students = await Student.find(
      { _id: { $in: student_ids } },
      { institute_id: 1, purchased_courses: 1 },
    ).lean();

    const foundIdSet = new Set(students.map((s) => s._id.toString()));
    const missing = student_ids.find((id) => !foundIdSet.has(id));
    if (missing) {
      return sendError(res, 400, false, `Student ${missing} not found.`);
    }

    const invalid = students.find(
      (s) =>
        s.institute_id.toString() !== instituteId.toString() ||
        !s.purchased_courses.some((c) => c.toString() === course_id),
    );
    if (invalid) {
      return sendError(
        res,
        400,
        false,
        `Student ${invalid._id} is not enrolled in this course at your institute.`,
      );
    }
  }

  const task = await Task.create({
    institute_id: instituteId,
    course_id,
    topic_id: topic_id || undefined,
    title,
    description,
    instructions,
    type,
    media_url,
    link_url: type === "link" ? link_url : undefined,
    text_content: type === "text" ? text_content : undefined,
    target,
    student_ids: target === "selected" ? student_ids : undefined,
    due_date,
    status,
    questions,
    created_by: instituteId,
  });

  return sendResponse(res, 201, true, "Task created successfully.", task);
});

// PUT /task/:id
const update = asyncHandler(async (req, res) => {
  const task = await Task.findOne({
    _id: req.params.id,
    institute_id: req.institute._id,
    is_deleted: false,
  });
  if (!task) return sendError(res, 404, false, "Task not found.");

  const {
    course_id,
    topic_id,
    title,
    description,
    instructions,
    type,
    link_url,
    text_content,
    target,
    student_ids,
    due_date,
    status,
    questions,
  } = req.body;

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
    task.course_id = course_id;
  }

  if (topic_id !== undefined) task.topic_id = topic_id || undefined;
  if (title !== undefined) task.title = title;
  if (description !== undefined) task.description = description;
  if (instructions !== undefined) task.instructions = instructions;
  if (due_date !== undefined) task.due_date = due_date;
  if (status !== undefined) task.status = status;
  if (questions !== undefined) task.questions = questions;

  const nextType = type !== undefined ? type : task.type;
  if (type !== undefined) task.type = type;
  if (link_url !== undefined && nextType === "link") task.link_url = link_url;
  if (text_content !== undefined && nextType === "text") task.text_content = text_content;

  const mediaTypes = ["audio", "video", "document"];
  if (mediaTypes.includes(nextType) && req.file) {
    const uploaded = await uploadToAws({
      file: req.file,
      fileName: `task_${Date.now()}`,
      folderName: "tasks",
    });
    task.media_url = uploaded?.cdnUrl || uploaded?.fullS3URL || "";
  }

  const nextTarget = target !== undefined ? target : task.target;
  if (target !== undefined) task.target = target;

  if (nextTarget === "selected" && student_ids !== undefined) {
    const students = await Student.find(
      { _id: { $in: student_ids } },
      { institute_id: 1, purchased_courses: 1 },
    ).lean();

    const foundIdSet = new Set(students.map((s) => s._id.toString()));
    const missing = student_ids.find((id) => !foundIdSet.has(id));
    if (missing) {
      return sendError(res, 400, false, `Student ${missing} not found.`);
    }

    const courseForCheck = (course_id !== undefined ? course_id : task.course_id).toString();
    const invalid = students.find(
      (s) =>
        s.institute_id.toString() !== req.institute._id.toString() ||
        !s.purchased_courses.some((c) => c.toString() === courseForCheck),
    );
    if (invalid) {
      return sendError(
        res,
        400,
        false,
        `Student ${invalid._id} is not enrolled in this course at your institute.`,
      );
    }
    task.student_ids = student_ids;
  } else if (nextTarget === "all") {
    task.student_ids = undefined;
  }

  await task.save();

  return sendResponse(res, 200, true, "Task updated successfully.", task);
});

// GET /task?courseId=&status=
const getAll = asyncHandler(async (req, res) => {
  const match = {
    institute_id: new Types.ObjectId(req.institute._id),
    is_deleted: false,
  };
  if (req.query.courseId) match.course_id = new Types.ObjectId(req.query.courseId);
  if (req.query.topicId) match.topic_id = new Types.ObjectId(req.query.topicId);
  if (req.query.status) match.status = req.query.status;

  const tasks = await Task.find(match)
    .populate("course_id", "course_name course_code")
    .populate("topic_id", "title")
    .sort({ createdAt: -1 })
    .lean();

  // Assigned / submitted counts per task, computed rather than stored.
  const taskIds = tasks.map((t) => t._id);
  const [enrollmentCounts, submissionCounts] = await Promise.all([
    Student.aggregate([
      { $match: { institute_id: new Types.ObjectId(req.institute._id) } },
      { $unwind: "$purchased_courses" },
      { $group: { _id: "$purchased_courses", count: { $sum: 1 } } },
    ]),
    TaskSubmission.aggregate([
      { $match: { task_id: { $in: taskIds }, status: { $in: ["submitted", "late", "reviewed"] } } },
      { $group: { _id: "$task_id", count: { $sum: 1 } } },
    ]),
  ]);

  const enrollmentByCourse = {};
  enrollmentCounts.forEach((row) => {
    enrollmentByCourse[row._id.toString()] = row.count;
  });
  const submittedByTask = {};
  submissionCounts.forEach((row) => {
    submittedByTask[row._id.toString()] = row.count;
  });

  const withCounts = tasks.map((t) => ({
    ...t,
    assigned_count:
      t.target === "selected"
        ? (t.student_ids || []).length
        : enrollmentByCourse[t.course_id?._id?.toString()] || 0,
    submitted_count: submittedByTask[t._id.toString()] || 0,
  }));

  return sendResponse(res, 200, true, "Tasks fetched successfully.", {
    total: withCounts.length,
    tasks: withCounts,
  });
});

// GET /task/:id — includes submission summary counts
const getOne = asyncHandler(async (req, res) => {
  const task = await Task.findOne({
    _id: req.params.id,
    institute_id: req.institute._id,
    is_deleted: false,
  })
    .populate("course_id", "course_name course_code")
    .populate("topic_id", "title")
    .populate("student_ids", "full_name enrollment_no")
    .lean();

  if (!task) return sendError(res, 404, false, "Task not found.");

  const statusCounts = await TaskSubmission.aggregate([
    { $match: { task_id: task._id } },
    { $group: { _id: "$status", count: { $sum: 1 } } },
  ]);
  const submission_summary = { pending: 0, submitted: 0, late: 0, reviewed: 0 };
  statusCounts.forEach(({ _id, count }) => {
    if (_id in submission_summary) submission_summary[_id] = count;
  });

  return sendResponse(res, 200, true, "Task fetched successfully.", {
    ...task,
    submission_summary,
  });
});

// GET /task/:id/submissions
const getSubmissions = asyncHandler(async (req, res) => {
  const task = await Task.findOne({
    _id: req.params.id,
    institute_id: req.institute._id,
    is_deleted: false,
  }).select("_id");
  if (!task) return sendError(res, 404, false, "Task not found.");

  const submissions = await TaskSubmission.find({ task_id: task._id })
    .populate("student_id", "full_name enrollment_no")
    .sort({ createdAt: -1 })
    .lean();

  return sendResponse(res, 200, true, "Submissions fetched successfully.", {
    total: submissions.length,
    submissions,
  });
});

// PUT /task/:id/submissions/:submissionId — grade / feedback
const updateSubmission = asyncHandler(async (req, res) => {
  const task = await Task.findOne({
    _id: req.params.id,
    institute_id: req.institute._id,
  }).select("_id");
  if (!task) return sendError(res, 404, false, "Task not found.");

  const { status, grade, feedback } = req.body;

  const submission = await TaskSubmission.findOne({
    _id: req.params.submissionId,
    task_id: task._id,
  });
  if (!submission) return sendError(res, 404, false, "Submission not found.");

  if (status !== undefined) submission.status = status;
  if (grade !== undefined) submission.grade = grade;
  if (feedback !== undefined) submission.feedback = feedback;

  await submission.save();

  return sendResponse(res, 200, true, "Submission updated successfully.", submission);
});

// DELETE /task/:id
const remove = asyncHandler(async (req, res) => {
  const task = await Task.findOneAndUpdate(
    { _id: req.params.id, institute_id: req.institute._id, is_deleted: false },
    { $set: { is_deleted: true } },
    { new: true },
  );
  if (!task) return sendError(res, 404, false, "Task not found.");

  return sendResponse(res, 200, true, "Task deleted successfully.");
});

// ── Student Panel ────────────────────────────────────────────────────────
function isAssignedToStudent(task, student) {
  return task.target === "selected"
    ? task.student_ids.some((id) => id.toString() === student._id.toString())
    : student.purchased_courses.some(
        (c) => c.toString() === (task.course_id._id || task.course_id).toString(),
      );
}

// GET /task/mine?courseId=&topicId=
const getMine = asyncHandler(async (req, res) => {
  const student = req.student;
  const match = {
    institute_id: student.institute_id,
    is_deleted: false,
    status: { $ne: "draft" },
    $or: [
      { target: "all", course_id: { $in: student.purchased_courses } },
      { target: "selected", student_ids: student._id },
    ],
  };
  if (req.query.courseId) match.course_id = new Types.ObjectId(req.query.courseId);
  if (req.query.topicId) match.topic_id = new Types.ObjectId(req.query.topicId);

  const tasks = await Task.find(match)
    .populate("course_id", "course_name course_code")
    .populate("topic_id", "title")
    .sort({ createdAt: -1 })
    .lean();

  const submissions = await TaskSubmission.find({
    student_id: student._id,
    task_id: { $in: tasks.map((t) => t._id) },
  }).lean();
  const submissionMap = {};
  submissions.forEach((s) => {
    submissionMap[s.task_id.toString()] = s;
  });

  const now = new Date();
  const result = tasks.map((t) => {
    const sub = submissionMap[t._id.toString()];
    const status = sub?.status || "pending";
    return {
      ...t,
      my_submission: sub
        ? {
            status: sub.status,
            grade: sub.grade,
            feedback: sub.feedback,
            submitted_at: sub.submitted_at,
            submitted_text: sub.submitted_text,
            answers: sub.answers,
          }
        : null,
      overdue: status === "pending" && t.due_date && new Date(t.due_date) < now,
    };
  });

  return sendResponse(res, 200, true, "Tasks fetched successfully.", {
    total: result.length,
    tasks: result,
  });
});

// GET /task/mine/:id
const getOneMine = asyncHandler(async (req, res) => {
  const student = req.student;
  const task = await Task.findOne({
    _id: req.params.id,
    institute_id: student.institute_id,
    is_deleted: false,
  })
    .populate("course_id", "course_name course_code")
    .populate("topic_id", "title");
  if (!task) return sendError(res, 404, false, "Task not found.");

  if (!isAssignedToStudent(task, student)) {
    return sendError(res, 403, false, "This task is not assigned to you.");
  }

  const submission = await TaskSubmission.findOne({
    task_id: task._id,
    student_id: student._id,
  }).lean();

  return sendResponse(res, 200, true, "Task fetched successfully.", {
    ...task.toObject(),
    my_submission: submission || null,
  });
});

// POST /task/mine/:id/submit
const submitMine = asyncHandler(async (req, res) => {
  const student = req.student;
  const task = await Task.findOne({
    _id: req.params.id,
    institute_id: student.institute_id,
    is_deleted: false,
  });
  if (!task) return sendError(res, 404, false, "Task not found.");

  if (!isAssignedToStudent(task, student)) {
    return sendError(res, 403, false, "This task is not assigned to you.");
  }

  const { submitted_text, answers } = req.body;

  let submitted_media_url;
  if (req.file) {
    const uploaded = await uploadToAws({
      file: req.file,
      fileName: `task_submission_${Date.now()}`,
      folderName: "task-submissions",
    });
    submitted_media_url = uploaded?.cdnUrl || uploaded?.fullS3URL || "";
  }

  if (!submitted_media_url && !submitted_text && !(answers && answers.length)) {
    return sendError(
      res,
      400,
      false,
      "Provide a file, text, or answers for this submission.",
    );
  }

  if (answers && answers.length) {
    const questionCount = task.questions?.length || 0;
    const invalid = answers.find((a) => a.question_index >= questionCount);
    if (invalid) {
      return sendError(
        res,
        400,
        false,
        "One or more answers reference a question that doesn't belong to this task.",
      );
    }
  }

  const isLate = task.due_date && new Date() > new Date(task.due_date);

  const submission = await TaskSubmission.findOneAndUpdate(
    { task_id: task._id, student_id: student._id },
    {
      $set: {
        ...(submitted_media_url && { submitted_media_url }),
        ...(submitted_text !== undefined && { submitted_text }),
        ...(answers && { answers }),
        status: isLate ? "late" : "submitted",
        submitted_at: new Date(),
      },
    },
    { new: true, upsert: true, setDefaultsOnInsert: true },
  );

  return sendResponse(res, 200, true, "Task submitted successfully.", submission);
});

module.exports = {
  create,
  getAll,
  getOne,
  update,
  getSubmissions,
  updateSubmission,
  remove,
  getMine,
  getOneMine,
  submitMine,
};
