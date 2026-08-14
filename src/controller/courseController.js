const Course = require("../models/Course");
const Topic = require("../models/Topic");
const SubTopic = require("../models/SubTopic");
const VideoModule = require("../models/VideoModule");
const AudioModule = require("../models/AudioModule");
const TextModule = require("../models/TextModule");
const ExerciseModule = require("../models/ExerciseModule");
const VocabularyModule = require("../models/VocabularyModule");
const asyncHandler = require("../middlewares/asyncHandler");
const { sendResponse, sendError } = require("../utils/apiResponse");
const { getGrantedIds } = require("../utils/studentAccess");

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
    created_by: req.admin?._id || req.editor?._id,
  });

  return sendResponse(res, 201, true, "Course created successfully.", course);
});

// GET /api/super-admin/course
const getAll = asyncHandler(async (req, res) => {
  const courses = await Course.find()
    .sort({ createdAt: 1 })
    .select("-__v");

  return sendResponse(res, 200, true, "Courses fetched successfully.", courses);
});

// GET /api/super-admin/course/:id
const getOne = asyncHandler(async (req, res) => {
  const course = await Course.findById(req.params.id)
    .populate("topic_ids", "title description order is_active");
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

// GET /api/super-admin/course/:id/module-count
// Returns the count of each module type (video, audio, text, vocabulary, exercise)
// for all subtopics that belong to the given course's topics.
const getCourseModuleCount = asyncHandler(async (req, res) => {
  const course = await Course.findById(req.params.id).select("course_name course_code topic_ids");
  if (!course) return sendError(res, 404, false, "Course not found.");

  const topicIds = course.topic_ids;

  // Find all active subtopics linked to those topics
  const subTopics = await SubTopic.find(
    { topic_id: { $in: topicIds }, is_active: true },
    "_id"
  );
  let subTopicIds = subTopics.map((st) => st._id);

  // Student Learning Access: a logged-in student should only see module
  // counts for subtopics their department+batch was actually granted —
  // mirrors subTopicController.getByTopic / moduleController's subtopic-scoped
  // check. Non-student callers (e.g. institute admin viewing course content)
  // keep seeing the full course-wide total, unrestricted.
  if (req.student) {
    const grantedSubtopicIds = await getGrantedIds({
      instituteId: req.student.institute_id,
      segment: req.student.segment,
      year: req.student.year,
      scopeMatch: { course_id: course._id },
      idField: "subtopic_ids",
    });
    if (grantedSubtopicIds) {
      subTopicIds = subTopicIds.filter((id) => grantedSubtopicIds.has(id.toString()));
    }
  }

  // Count all active modules in parallel
  const [videoCount, audioCount, textCount, vocabularyCount, exerciseCount] =
    await Promise.all([
      VideoModule.countDocuments({ sub_topic_id: { $in: subTopicIds }, is_active: true }),
      AudioModule.countDocuments({ sub_topic_id: { $in: subTopicIds }, is_active: true }),
      TextModule.countDocuments({ sub_topic_id: { $in: subTopicIds }, is_active: true }),
      VocabularyModule.countDocuments({ sub_topic_id: { $in: subTopicIds }, is_active: true }),
      ExerciseModule.countDocuments({ sub_topic_id: { $in: subTopicIds }, is_active: true }),
    ]);

  const total = videoCount + audioCount + textCount + vocabularyCount + exerciseCount;

  return sendResponse(res, 200, true, "Course module count fetched successfully.", {
    course_id: course._id,
    course_name: course.course_name,
    course_code: course.course_code,
    topic_count: topicIds.length,
    subtopic_count: subTopicIds.length,
    module_counts: {
      video: videoCount,
      audio: audioCount,
      text: textCount,
      vocabulary: vocabularyCount,
      exercise: exerciseCount,
    },
    total_modules: total,
  });
});

module.exports = { create, getAll, getOne, update, remove, getCourseModuleCount };
