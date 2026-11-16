const { Types } = require("mongoose");
const path = require("path");
const fs = require("fs");

const InteractiveTask = require("../models/InteractiveTask");
const InteractiveSubmission = require("../models/InteractiveSubmission");
const Student = require("../models/Student");
const asyncHandler = require("../middlewares/asyncHandler");
const { isBatchAllowed } = require("../utils/teacherAccess");
const { sendResponse, sendError } = require("../utils/apiResponse");
const { getTeacherAssignedCourseIds, isCourseAllowed } = require("../utils/teacherAccess");
const VoskSpeechService = require("../service/voskSpeechService");

// ─────────────────────────────────────────────────────────────────────────────
// INSTITUTE / FACULTY CONTROLLERS
// ─────────────────────────────────────────────────────────────────────────────

// GET /api/interactive-task
const list = asyncHandler(async (req, res) => {
  const { courseId, topicId, page = 1, limit = 10 } = req.query;
  const pageNum = Math.max(1, parseInt(page, 10));
  const limitNum = Math.max(1, parseInt(limit, 10));

  const filter = {
    institute_id: req.institute._id,
    is_deleted: false,
  };

  if (courseId) {
    filter.course_id = new Types.ObjectId(courseId);
  }
  if (topicId) {
    filter.topic_id = new Types.ObjectId(topicId);
  }

  // If faculty is accessing, verify faculty allowed courses
  if (req.teacher) {
    const allowedCourseIds = await getTeacherAssignedCourseIds(req.teacher);
    if (allowedCourseIds !== null && allowedCourseIds.length > 0) {
      if (filter.course_id) {
        if (!isCourseAllowed(filter.course_id, allowedCourseIds)) {
          return sendResponse(res, 200, true, "No tasks found.", {
            tasks: [],
            total: 0,
            page: pageNum,
            limit: limitNum,
          });
        }
      } else {
        filter.course_id = { $in: allowedCourseIds };
      }
    }
  }

  const [tasks, total] = await Promise.all([
    InteractiveTask.find(filter)
      .populate("course_id", "course_name course_code")
      .populate("topic_id", "title")
      .sort({ createdAt: -1 })
      .skip((pageNum - 1) * limitNum)
      .limit(limitNum)
      .lean(),
    InteractiveTask.countDocuments(filter),
  ]);

  return sendResponse(res, 200, true, "Interactive tasks fetched successfully.", {
    tasks,
    total,
    page: pageNum,
    limit: limitNum,
  });
});

// GET /api/interactive-task/:id
const getOne = asyncHandler(async (req, res) => {
  const task = await InteractiveTask.findOne({
    _id: req.params.id,
    institute_id: req.institute._id,
    is_deleted: false,
  })
    .populate("course_id", "course_name course_code")
    .populate("topic_id", "title")
    .lean();

  if (!task) {
    return sendError(res, 404, false, "Interactive task not found.");
  }

  return sendResponse(res, 200, true, "Interactive task fetched.", task);
});

// POST /api/interactive-task
const create = asyncHandler(async (req, res) => {
  const {
    course_id,
    topic_id,
    title,
    paragraph,
    max_retries,
    target_wpm,
    min_accuracy,
    assigned_department,
    assigned_batch,
  } = req.body;

  if (!course_id || !topic_id || !title || !paragraph) {
    return sendError(
      res,
      400,
      false,
      "Course, Topic, Title, and Paragraph are required.",
    );
  }

  const wordCount = paragraph.trim().split(/\s+/).filter(Boolean).length;
  if (wordCount > 100) {
    return sendError(
      res,
      400,
      false,
      `Paragraph cannot exceed 100 words. Currently contains ${wordCount} words.`,
    );
  }

  // Course authorization check
  const courseAssigned = (req.institute.downloaded_course_ids || []).some(
    (id) => id.toString() === course_id.toString(),
  );
  if (!courseAssigned) {
    return sendError(
      res,
      400,
      false,
      "This course is not downloaded by your institute.",
    );
  }

  // Faculty specific checks
  if (req.teacher) {
    const allowedCourseIds = await getTeacherAssignedCourseIds(req.teacher);
    if (!isCourseAllowed(course_id, allowedCourseIds)) {
      return sendError(
        res,
        403,
        false,
        "You are not assigned to instruct this course.",
      );
    }

    if (assigned_department) {
      const teacherBranches = (req.teacher.assigned_departments || []).map((b) =>
        b.toLowerCase().trim(),
      );
      if (!teacherBranches.includes(assigned_department.toLowerCase().trim())) {
        return sendError(
          res,
          403,
          false,
          "You can only assign tasks to branches assigned to you.",
        );
      }
    }
  }

  // Enforce retry limits between 1 and 5
  const parsedRetries = Math.min(Math.max(parseInt(max_retries, 10) || 3, 1), 5);

  const newTask = await InteractiveTask.create({
    institute_id: req.institute._id,
    course_id,
    topic_id,
    title: title.trim(),
    paragraph: paragraph.trim(),
    max_retries: parsedRetries,
    target_wpm: parseInt(target_wpm, 10) || 120,
    min_accuracy: parseInt(min_accuracy, 10) || 75,
    assigned_department: assigned_department ? assigned_department.trim() : null,
    assigned_batch: assigned_batch ? parseInt(assigned_batch, 10) : null,
    created_by_role: req.teacher ? "faculty" : "institute",
    created_by_id: req.teacher ? req.teacher._id : req.institute._id,
  });

  return sendResponse(
    res,
    201,
    true,
    "Interactive reading task created successfully.",
    newTask,
  );
});

// PUT /api/interactive-task/:id
const update = asyncHandler(async (req, res) => {
  const task = await InteractiveTask.findOne({
    _id: req.params.id,
    institute_id: req.institute._id,
    is_deleted: false,
  });

  if (!task) {
    return sendError(res, 404, false, "Interactive task not found.");
  }

  // Faculty permission checks
  if (req.teacher) {
    const allowedCourseIds = await getTeacherAssignedCourseIds(req.teacher);
    if (!isCourseAllowed(task.course_id, allowedCourseIds)) {
      return sendError(
        res,
        403,
        false,
        "You do not have access to edit tasks for this course.",
      );
    }
  }

  const {
    title,
    paragraph,
    max_retries,
    target_wpm,
    min_accuracy,
    assigned_department,
    assigned_batch,
  } = req.body;

  if (title) task.title = title.trim();
  if (paragraph) {
    const wordCount = paragraph.trim().split(/\s+/).filter(Boolean).length;
    if (wordCount > 100) {
      return sendError(
        res,
        400,
        false,
        `Paragraph cannot exceed 100 words. Currently contains ${wordCount} words.`,
      );
    }
    task.paragraph = paragraph.trim();
  }
  if (max_retries !== undefined) {
    task.max_retries = Math.min(Math.max(parseInt(max_retries, 10) || 3, 1), 5);
  }
  if (target_wpm !== undefined) task.target_wpm = parseInt(target_wpm, 10) || 120;
  if (min_accuracy !== undefined) task.min_accuracy = parseInt(min_accuracy, 10) || 75;
  if (assigned_department !== undefined) {
    task.assigned_department = assigned_department ? assigned_department.trim() : null;
  }
  if (assigned_batch !== undefined) {
    task.assigned_batch = assigned_batch ? parseInt(assigned_batch, 10) : null;
  }

  await task.save();

  return sendResponse(
    res,
    200,
    true,
    "Interactive task updated successfully.",
    task,
  );
});

// DELETE /api/interactive-task/:id
const remove = asyncHandler(async (req, res) => {
  const task = await InteractiveTask.findOne({
    _id: req.params.id,
    institute_id: req.institute._id,
    is_deleted: false,
  });

  if (!task) {
    return sendError(res, 404, false, "Interactive task not found.");
  }

  if (req.teacher) {
    const allowedCourseIds = await getTeacherAssignedCourseIds(req.teacher);
    if (!isCourseAllowed(task.course_id, allowedCourseIds)) {
      return sendError(
        res,
        403,
        false,
        "You do not have access to delete tasks for this course.",
      );
    }
  }

  task.is_deleted = true;
  await task.save();

  return sendResponse(res, 200, true, "Interactive task deleted successfully.");
});

// PUT /api/interactive-task/:id/assign
const assignTask = asyncHandler(async (req, res) => {
  const { department, batch, assignments } = req.body;

  const task = await InteractiveTask.findOne({
    _id: req.params.id,
    institute_id: req.institute._id,
    is_deleted: false,
  });

  if (!task) {
    return sendError(res, 404, false, "Interactive task not found.");
  }

  // Handle array of assignments (bulk / multi-batch)
  if (Array.isArray(assignments) && assignments.length > 0) {
    if (req.teacher) {
      const teacherBranches = (req.teacher.assigned_departments || []).map((b) =>
        b.toLowerCase().trim(),
      );
      for (const item of assignments) {
        const seg = (item.segment || item.department || "").toLowerCase().trim();
        if (!teacherBranches.includes(seg)) {
          return sendError(
            res,
            403,
            false,
            `Access denied. You can only assign tasks to your assigned branches (${(req.teacher.assigned_departments || []).join(", ")}).`,
          );
        }
        if (item.year && req.teacher.assigned_batches && req.teacher.assigned_batches.length > 0) {
          if (!isBatchAllowed(req.teacher, item.segment || item.department, item.year)) {
            return sendError(
              res,
              403,
              false,
              `Access denied. You can only assign tasks to your assigned batches (${req.teacher.assigned_batches.join(", ")}).`,
            );
          }
        }
      }
    }

    const cleanAssignments = assignments.map((a) => ({
      segment: (a.segment || a.department).trim(),
      year: Number(a.year),
    }));

    task.assigned_batches = cleanAssignments;
    task.assigned_department = cleanAssignments[0]?.segment || null;
    task.assigned_batch = cleanAssignments.length === 1 ? cleanAssignments[0]?.year : null;
    await task.save();

    return sendResponse(
      res,
      200,
      true,
      `Task successfully assigned to ${cleanAssignments.length} batch(es).`,
      task,
    );
  }

  if (!department) {
    return sendError(res, 400, false, "Department/Branch is required.");
  }

  // Role constraint:
  // Institute is able to assign tasks to all branches & batches.
  // Faculty is only able to assign tasks to branches assigned to them.
  if (req.teacher) {
    const teacherBranches = (req.teacher.assigned_departments || []).map((b) =>
      b.toLowerCase().trim(),
    );
    if (!teacherBranches.includes(department.toLowerCase().trim())) {
      return sendError(
        res,
        403,
        false,
        `Access denied. You can only assign tasks to your assigned branches (${(req.teacher.assigned_departments || []).join(", ")}).`,
      );
    }

    if (batch && req.teacher.assigned_batches && req.teacher.assigned_batches.length > 0) {
      if (!isBatchAllowed(req.teacher, department, batch)) {
        return sendError(
          res,
          403,
          false,
          `Access denied. You can only assign tasks to your assigned batches (${req.teacher.assigned_batches.join(", ")}).`,
        );
      }
    }
  }

  task.assigned_department = department.trim();
  task.assigned_batch = batch ? parseInt(batch, 10) : null;
  task.assigned_batches = batch ? [{ segment: department.trim(), year: parseInt(batch, 10) }] : [];
  await task.save();

  return sendResponse(
    res,
    200,
    true,
    `Task successfully assigned to ${department}${batch ? ` - Year ${batch}` : ""}.`,
    task,
  );
});

// GET /api/interactive-task/:id/submissions
const getSubmissions = asyncHandler(async (req, res) => {
  const task = await InteractiveTask.findOne({
    _id: req.params.id,
    institute_id: req.institute._id,
    is_deleted: false,
  });

  if (!task) {
    return sendError(res, 404, false, "Interactive task not found.");
  }

  const submissions = await InteractiveSubmission.find({
    task_id: task._id,
    institute_id: req.institute._id,
  })
    .populate("student_id", "name roll_no enrollment_no segment year email")
    .sort({ createdAt: -1 })
    .lean();

  return sendResponse(
    res,
    200,
    true,
    "Student submissions fetched successfully.",
    { submissions },
  );
});

// ─────────────────────────────────────────────────────────────────────────────
// STUDENT CONTROLLERS
// ─────────────────────────────────────────────────────────────────────────────

// GET /api/interactive-task/student/course/:courseId
const getStudentTasks = asyncHandler(async (req, res) => {
  const { courseId } = req.params;
  const { topicId } = req.query;
  const student = req.student;

  const filter = {
    institute_id: student.institute_id,
    course_id: new Types.ObjectId(courseId),
    is_deleted: false,
    status: "published",
  };

  if (topicId) {
    filter.topic_id = new Types.ObjectId(topicId);
  }

  // Branch & batch access condition:
  // Visible if task has no assigned department (all branches) OR matches student.segment OR matches assigned_batches
  filter.$or = [
    {
      $and: [
        {
          $or: [
            { assigned_department: null },
            { assigned_department: "" },
            { assigned_department: student.segment },
          ],
        },
        {
          $or: [
            { assigned_batch: null },
            { assigned_batch: student.year },
          ],
        },
      ],
    },
    {
      assigned_batches: {
        $elemMatch: {
          segment: student.segment,
          year: student.year,
        },
      },
    },
  ];

  const tasks = await InteractiveTask.find(filter)
    .populate("topic_id", "title")
    .sort({ createdAt: -1 })
    .lean();

  // Attach student's previous submission if available
  const taskIds = tasks.map((t) => t._id);
  const submissions = await InteractiveSubmission.find({
    task_id: { $in: taskIds },
    student_id: student._id,
  }).lean();

  const submissionMap = new Map();
  submissions.forEach((s) => {
    submissionMap.set(s.task_id.toString(), s);
  });

  const tasksWithProgress = tasks.map((t) => {
    const sub = submissionMap.get(t._id.toString());
    return {
      ...t,
      submission: sub || null,
      is_completed: sub ? sub.status === "completed" : false,
      user_attempts: sub ? sub.attempts_count : 0,
      user_accuracy: sub ? sub.accuracy_score : null,
      user_wpm: sub ? sub.wpm : null,
    };
  });

  return sendResponse(
    res,
    200,
    true,
    "Student interactive tasks fetched successfully.",
    { tasks: tasksWithProgress },
  );
});

// GET /api/interactive-task/student/:id
const getStudentTaskById = asyncHandler(async (req, res) => {
  const student = req.student;
  const task = await InteractiveTask.findOne({
    _id: req.params.id,
    institute_id: student.institute_id,
    is_deleted: false,
    status: "published",
  })
    .populate("course_id", "course_name course_code")
    .populate("topic_id", "title")
    .lean();

  if (!task) {
    return sendError(res, 404, false, "Interactive reading task not found.");
  }

  const existingSubmission = await InteractiveSubmission.findOne({
    task_id: task._id,
    student_id: student._id,
  }).lean();

  return sendResponse(res, 200, true, "Task details fetched.", {
    task,
    submission: existingSubmission || null,
  });
});

// POST /api/interactive-task/student/:id/evaluate
// Evaluates speech in real time with Vosk, returning word-by-word diff (green/yellow/red)
const evaluateSpeech = asyncHandler(async (req, res) => {
  const student = req.student;
  const task = await InteractiveTask.findOne({
    _id: req.params.id,
    institute_id: student.institute_id,
    is_deleted: false,
  });

  if (!task) {
    return sendError(res, 404, false, "Interactive reading task not found.");
  }

  if (!req.file) {
    return sendError(res, 400, false, "Audio file is required for evaluation.");
  }

  const audioFilePath = req.file.path;

  try {
    const evaluation = await VoskSpeechService.evaluateAudio(
      audioFilePath,
      task.paragraph,
    );

    // Audio file URL accessible by browser
    const audioUrl = `/media/interactive-learning/${req.file.filename}`;

    return sendResponse(res, 200, true, "Voice evaluated successfully.", {
      accuracy_score: evaluation.accuracy_score,
      wpm: evaluation.wpm,
      duration_seconds: evaluation.duration_seconds,
      transcribed_text: evaluation.transcribed_text,
      word_analysis: evaluation.word_analysis,
      audio_url: audioUrl,
      passing_accuracy: task.min_accuracy,
      target_wpm: task.target_wpm,
      max_retries: task.max_retries,
    });
  } catch (evalError) {
    console.error("[EvaluateSpeech] Error:", evalError);
    return sendError(
      res,
      500,
      false,
      `Vosk speech recognition failed: ${evalError.message}`,
    );
  }
});

// POST /api/interactive-task/student/:id/submit
// Saves final student submission when clicking "Save & Next"
const submitSpeech = asyncHandler(async (req, res) => {
  const student = req.student;
  const task = await InteractiveTask.findOne({
    _id: req.params.id,
    institute_id: student.institute_id,
    is_deleted: false,
  });

  if (!task) {
    return sendError(res, 404, false, "Interactive reading task not found.");
  }

  const {
    accuracy_score,
    wpm,
    duration_seconds,
    transcribed_text,
    word_analysis,
    audio_url,
    attempts_count = 1,
  } = req.body;

  if (accuracy_score === undefined || !audio_url) {
    return sendError(
      res,
      400,
      false,
      "Accuracy score and audio recording are required.",
    );
  }

  // Enforce retry limit
  const attempts = Math.min(parseInt(attempts_count, 10) || 1, task.max_retries);

  const submission = await InteractiveSubmission.findOneAndUpdate(
    {
      task_id: task._id,
      student_id: student._id,
    },
    {
      institute_id: student.institute_id,
      accuracy_score: Number(accuracy_score),
      wpm: Number(wpm) || 0,
      duration_seconds: Number(duration_seconds) || 0,
      attempts_count: attempts,
      audio_url,
      transcribed_text: transcribed_text || "",
      word_analysis: Array.isArray(word_analysis) ? word_analysis : [],
      status: "completed",
    },
    { upsert: true, new: true },
  );

  return sendResponse(
    res,
    200,
    true,
    "Interactive reading attempt saved successfully.",
    submission,
  );
});

module.exports = {
  list,
  getOne,
  create,
  update,
  remove,
  assignTask,
  getSubmissions,
  getStudentTasks,
  getStudentTaskById,
  evaluateSpeech,
  submitSpeech,
};

