const { Types } = require("mongoose");

const StudentProgress = require("../models/StudentProgress");
const asyncHandler = require("../middlewares/asyncHandler");
const { sendResponse, sendError } = require("../utils/apiResponse");

// GET /progress/me — student's own progress
const getMyProgress = asyncHandler(async (req, res) => {
  const progress = await StudentProgress.aggregate([
    { $match: { student_id: new Types.ObjectId(req.student._id) } },
    { $sort: { last_accessed: -1 } },
    {
      $lookup: {
        from: "topics",
        localField: "topic_id",
        foreignField: "_id",
        as: "topic",
        pipeline: [{ $project: { title: 1 } }],
      },
    },
    { $unwind: { path: "$topic", preserveNullAndEmptyArrays: true } },
    {
      $lookup: {
        from: "subtopics",
        localField: "subtopic_id",
        foreignField: "_id",
        as: "subtopic",
        pipeline: [{ $project: { title: 1 } }],
      },
    },
    { $unwind: { path: "$subtopic", preserveNullAndEmptyArrays: true } },
  ]);

  return sendResponse(res, 200, true, "Progress fetched successfully.", progress);
});

// GET /progress/student/:id — teacher/college views a student's progress
const getStudentProgress = asyncHandler(async (req, res) => {
  const progress = await StudentProgress.aggregate([
    { $match: { student_id: new Types.ObjectId(req.params.id) } },
    { $sort: { last_accessed: -1 } },
    {
      $lookup: {
        from: "topics",
        localField: "topic_id",
        foreignField: "_id",
        as: "topic",
        pipeline: [{ $project: { title: 1 } }],
      },
    },
    { $unwind: { path: "$topic", preserveNullAndEmptyArrays: true } },
    {
      $lookup: {
        from: "subtopics",
        localField: "subtopic_id",
        foreignField: "_id",
        as: "subtopic",
        pipeline: [{ $project: { title: 1 } }],
      },
    },
    { $unwind: { path: "$subtopic", preserveNullAndEmptyArrays: true } },
    {
      $group: {
        _id: "$topic_id",
        topic: { $first: "$topic" },
        modules_completed: { $sum: { $cond: ["$is_completed", 1, 0] } },
        total_modules: { $sum: 1 },
        avg_score: { $avg: "$score" },
        last_accessed: { $max: "$last_accessed" },
        details: { $push: "$$ROOT" },
      },
    },
    { $sort: { last_accessed: -1 } },
  ]);

  return sendResponse(res, 200, true, "Progress fetched successfully.", progress);
});

// GET /progress/dashboard-kpi — student's dashboard KPI statistics
const getDashboardKPI = asyncHandler(async (req, res) => {
  const Student = require("../models/Student");
  const Course = require("../models/Course");
  const Topic = require("../models/Topic");
  const SubTopic = require("../models/SubTopic");
  const StudentProgress = require("../models/StudentProgress");

  // Models for modules
  const VideoModule = require("../models/VideoModule");
  const AudioModule = require("../models/AudioModule");
  const TextModule = require("../models/TextModule");
  const ExerciseModule = require("../models/ExerciseModule");
  const VocabularyModule = require("../models/VocabularyModule");

  const student = await Student.findById(req.student._id).select("purchased_courses");
  if (!student) {
    const { sendError } = require("../utils/apiResponse");
    return sendError(res, 404, false, "Student not found.");
  }

  const courseIds = student.purchased_courses || [];
  if (!courseIds.length) {
    return sendResponse(res, 200, true, "KPI fetched successfully.", {
      totalLessons: 0,
      completedLessons: 0,
      incompleteLessons: 0,
      inProgressLessons: 0,
      notStartedLessons: 0,
      totalModules: 0,
      completedModules: 0,
      pendingModules: 0,
    });
  }

  // Find all active topics in these courses
  const courses = await Course.find({ _id: { $in: courseIds }, is_active: true }).select("topic_ids");
  const topicIds = [];
  const seenTopics = new Set();
  for (const c of courses) {
    for (const id of c.topic_ids) {
      if (!seenTopics.has(id.toString())) {
        seenTopics.add(id.toString());
        topicIds.push(id);
      }
    }
  }

  if (!topicIds.length) {
    return sendResponse(res, 200, true, "KPI fetched successfully.", {
      totalLessons: 0,
      completedLessons: 0,
      incompleteLessons: 0,
      inProgressLessons: 0,
      notStartedLessons: 0,
      totalModules: 0,
      completedModules: 0,
      pendingModules: 0,
    });
  }

  // Find all active subtopics (lessons) in these topics
  const subTopics = await SubTopic.find({ topic_id: { $in: topicIds }, is_active: true }).select("_id topic_id title");
  const subTopicIds = subTopics.map((s) => s._id);

  if (!subTopicIds.length) {
    return sendResponse(res, 200, true, "KPI fetched successfully.", {
      totalLessons: 0,
      completedLessons: 0,
      incompleteLessons: 0,
      inProgressLessons: 0,
      notStartedLessons: 0,
      totalModules: 0,
      completedModules: 0,
      pendingModules: 0,
    });
  }

  // Query active modules across all 5 collections
  const moduleQueries = [
    VideoModule.find({ sub_topic_id: { $in: subTopicIds }, is_active: true }).select("_id sub_topic_id"),
    AudioModule.find({ sub_topic_id: { $in: subTopicIds }, is_active: true }).select("_id sub_topic_id"),
    TextModule.find({ sub_topic_id: { $in: subTopicIds }, is_active: true }).select("_id sub_topic_id"),
    ExerciseModule.find({ sub_topic_id: { $in: subTopicIds }, is_active: true }).select("_id sub_topic_id"),
    VocabularyModule.find({ sub_topic_id: { $in: subTopicIds }, is_active: true }).select("_id sub_topic_id"),
  ];

  const moduleResults = await Promise.all(moduleQueries);

  // Group modules by subtopic
  const subtopicModulesMap = {};
  subTopicIds.forEach((id) => {
    subtopicModulesMap[id.toString()] = [];
  });

  let totalModulesCount = 0;
  const allActiveModuleIds = [];
  const moduleTypesMap = {};
  const moduleTypes = ["video", "audio", "text", "exercise", "vocabulary"];

  const moduleBreakdown = {
    video: { completed: 0, total: 0 },
    audio: { completed: 0, total: 0 },
    text: { completed: 0, total: 0 },
    exercise: { completed: 0, total: 0 },
    vocabulary: { completed: 0, total: 0 },
  };

  moduleResults.forEach((modules, idx) => {
    const type = moduleTypes[idx];
    modules.forEach((mod) => {
      const subIdStr = mod.sub_topic_id.toString();
      if (subtopicModulesMap[subIdStr]) {
        subtopicModulesMap[subIdStr].push(mod._id.toString());
        allActiveModuleIds.push(mod._id);
        moduleTypesMap[mod._id.toString()] = type;
        moduleBreakdown[type].total++;
        totalModulesCount++;
      }
    });
  });

  // Fetch student progress records for active modules
  const progressRecords = await StudentProgress.find({
    student_id: student._id,
    module_id: { $in: allActiveModuleIds },
  }).select("module_id progress_percentage is_completed");

  const progressMap = {};
  progressRecords.forEach((rec) => {
    progressMap[rec.module_id.toString()] = {
      progress_percentage: rec.progress_percentage || 0,
      is_completed: rec.is_completed || false,
    };
  });

  // Completed/Pending module stats
  let completedModulesCount = 0;
  progressRecords.forEach((rec) => {
    const isCompleted = rec.is_completed || rec.progress_percentage === 100;
    if (isCompleted) {
      completedModulesCount++;
      const type = moduleTypesMap[rec.module_id.toString()];
      if (type && moduleBreakdown[type]) {
        moduleBreakdown[type].completed++;
      }
    }
  });
  const pendingModulesCount = totalModulesCount - completedModulesCount;

  // Determine subtopic (lesson) statuses
  let completedLessons = 0;
  let inProgressLessons = 0;
  let notStartedLessons = 0;

  subTopics.forEach((st) => {
    const stIdStr = st._id.toString();
    const modIds = subtopicModulesMap[stIdStr] || [];

    if (modIds.length === 0) {
      // If there are no modules, consider it completed (default behavior)
      completedLessons++;
      return;
    }

    let completedModCount = 0;
    let startedModCount = 0;
    let totalProgressSum = 0;

    modIds.forEach((mId) => {
      const prog = progressMap[mId];
      if (prog) {
        totalProgressSum += prog.progress_percentage;
        if (prog.is_completed || prog.progress_percentage === 100) {
          completedModCount++;
        }
        if (prog.progress_percentage > 0) {
          startedModCount++;
        }
      }
    });

    const averageProgress = totalProgressSum / modIds.length;

    if (completedModCount === modIds.length || averageProgress === 100) {
      completedLessons++;
    } else if (startedModCount > 0 || averageProgress > 0) {
      inProgressLessons++;
    } else {
      notStartedLessons++;
    }
  });

  const totalLessons = subTopicIds.length;
  const incompleteLessons = totalLessons - completedLessons;

  return sendResponse(res, 200, true, "KPI stats fetched successfully.", {
    totalLessons,
    completedLessons,
    incompleteLessons,
    inProgressLessons,
    notStartedLessons,
    totalModules: totalModulesCount,
    completedModules: completedModulesCount,
    pendingModules: pendingModulesCount,
    moduleBreakdown,
  });
});

// GET /progress/topic/:id — per-subtopic completion % for one topic (student's own progress)
const getTopicProgress = asyncHandler(async (req, res) => {
  const SubTopic = require("../models/SubTopic");
  const VideoModule = require("../models/VideoModule");
  const AudioModule = require("../models/AudioModule");
  const TextModule = require("../models/TextModule");
  const ExerciseModule = require("../models/ExerciseModule");
  const VocabularyModule = require("../models/VocabularyModule");

  const { id: topicId } = req.params;

  const subTopics = await SubTopic.find({ topic_id: topicId, is_active: true })
    .sort({ order: 1 })
    .select("_id title order");
  const subTopicIds = subTopics.map((s) => s._id);

  if (!subTopicIds.length) {
    return sendResponse(res, 200, true, "Progress fetched successfully.", {
      topic_id: topicId,
      percentage: 0,
      total_modules: 0,
      completed_modules: 0,
      subtopics: [],
    });
  }

  const moduleTypes = ["video", "audio", "text", "exercise", "vocabulary"];
  const moduleResults = await Promise.all([
    VideoModule.find({ sub_topic_id: { $in: subTopicIds }, is_active: true }).select("_id sub_topic_id"),
    AudioModule.find({ sub_topic_id: { $in: subTopicIds }, is_active: true }).select("_id sub_topic_id"),
    TextModule.find({ sub_topic_id: { $in: subTopicIds }, is_active: true }).select("_id sub_topic_id"),
    ExerciseModule.find({ sub_topic_id: { $in: subTopicIds }, is_active: true }).select("_id sub_topic_id"),
    VocabularyModule.find({ sub_topic_id: { $in: subTopicIds }, is_active: true }).select("_id sub_topic_id"),
  ]);

  const subtopicModulesMap = {};
  subTopicIds.forEach((id) => {
    subtopicModulesMap[id.toString()] = [];
  });

  const allActiveModuleIds = [];
  moduleResults.forEach((modules, idx) => {
    modules.forEach((mod) => {
      const subIdStr = mod.sub_topic_id.toString();
      if (subtopicModulesMap[subIdStr]) {
        subtopicModulesMap[subIdStr].push(mod._id.toString());
        allActiveModuleIds.push(mod._id);
      }
    });
  });

  const progressRecords = await StudentProgress.find({
    student_id: req.student._id,
    module_id: { $in: allActiveModuleIds },
  }).select("module_id is_completed progress_percentage");

  const progressMap = {};
  progressRecords.forEach((rec) => {
    progressMap[rec.module_id.toString()] =
      rec.is_completed || rec.progress_percentage === 100;
  });

  let totalModules = 0;
  let completedModules = 0;

  const subtopics = subTopics.map((st) => {
    const stIdStr = st._id.toString();
    const modIds = subtopicModulesMap[stIdStr] || [];
    const completedCount = modIds.filter((mId) => progressMap[mId]).length;

    totalModules += modIds.length;
    completedModules += completedCount;

    return {
      subtopic_id: st._id,
      title: st.title,
      order: st.order,
      total_modules: modIds.length,
      completed_modules: completedCount,
      percentage: modIds.length ? Math.round((completedCount / modIds.length) * 100) : 0,
    };
  });

  const percentage = totalModules ? Math.round((completedModules / totalModules) * 100) : 0;

  return sendResponse(res, 200, true, "Progress fetched successfully.", {
    topic_id: topicId,
    percentage,
    total_modules: totalModules,
    completed_modules: completedModules,
    subtopics,
  });
});

// GET /progress/course/:id — per-topic completion % across one course (student's own progress)
const getCourseProgress = asyncHandler(async (req, res) => {
  const Course = require("../models/Course");
  const Topic = require("../models/Topic");
  const SubTopic = require("../models/SubTopic");
  const VideoModule = require("../models/VideoModule");
  const AudioModule = require("../models/AudioModule");
  const TextModule = require("../models/TextModule");
  const ExerciseModule = require("../models/ExerciseModule");
  const VocabularyModule = require("../models/VocabularyModule");

  const { id: courseId } = req.params;

  const course = await Course.findById(courseId).select("topic_ids");
  if (!course) return sendError(res, 404, false, "Course not found.");

  const topics = await Topic.find({ _id: { $in: course.topic_ids }, is_active: true })
    .sort({ order: 1 })
    .select("_id title order");
  const topicIds = topics.map((t) => t._id);

  if (!topicIds.length) {
    return sendResponse(res, 200, true, "Progress fetched successfully.", {
      course_id: courseId,
      percentage: 0,
      total_modules: 0,
      completed_modules: 0,
      topics: [],
    });
  }

  const subTopics = await SubTopic.find({ topic_id: { $in: topicIds }, is_active: true }).select("_id topic_id");
  const subTopicIds = subTopics.map((s) => s._id);
  const subtopicToTopic = {};
  subTopics.forEach((s) => {
    subtopicToTopic[s._id.toString()] = s.topic_id.toString();
  });

  const moduleResults = await Promise.all([
    VideoModule.find({ sub_topic_id: { $in: subTopicIds }, is_active: true }).select("_id sub_topic_id"),
    AudioModule.find({ sub_topic_id: { $in: subTopicIds }, is_active: true }).select("_id sub_topic_id"),
    TextModule.find({ sub_topic_id: { $in: subTopicIds }, is_active: true }).select("_id sub_topic_id"),
    ExerciseModule.find({ sub_topic_id: { $in: subTopicIds }, is_active: true }).select("_id sub_topic_id"),
    VocabularyModule.find({ sub_topic_id: { $in: subTopicIds }, is_active: true }).select("_id sub_topic_id"),
  ]);

  const topicModulesMap = {};
  topicIds.forEach((id) => {
    topicModulesMap[id.toString()] = [];
  });

  const allActiveModuleIds = [];
  moduleResults.forEach((modules) => {
    modules.forEach((mod) => {
      const topicIdStr = subtopicToTopic[mod.sub_topic_id.toString()];
      if (topicIdStr && topicModulesMap[topicIdStr]) {
        topicModulesMap[topicIdStr].push(mod._id.toString());
        allActiveModuleIds.push(mod._id);
      }
    });
  });

  const progressRecords = await StudentProgress.find({
    student_id: req.student._id,
    module_id: { $in: allActiveModuleIds },
  }).select("module_id is_completed progress_percentage");

  const progressMap = {};
  progressRecords.forEach((rec) => {
    progressMap[rec.module_id.toString()] =
      rec.is_completed || rec.progress_percentage === 100;
  });

  let totalModules = 0;
  let completedModules = 0;

  const topicsOut = topics.map((t) => {
    const modIds = topicModulesMap[t._id.toString()] || [];
    const completedCount = modIds.filter((mId) => progressMap[mId]).length;

    totalModules += modIds.length;
    completedModules += completedCount;

    return {
      topic_id: t._id,
      title: t.title,
      order: t.order,
      total_modules: modIds.length,
      completed_modules: completedCount,
      percentage: modIds.length ? Math.round((completedCount / modIds.length) * 100) : 0,
    };
  });

  const percentage = totalModules ? Math.round((completedModules / totalModules) * 100) : 0;

  return sendResponse(res, 200, true, "Progress fetched successfully.", {
    course_id: courseId,
    percentage,
    total_modules: totalModules,
    completed_modules: completedModules,
    topics: topicsOut,
  });
});

module.exports = {
  getMyProgress,
  getStudentProgress,
  getDashboardKPI,
  getTopicProgress,
  getCourseProgress,
};
