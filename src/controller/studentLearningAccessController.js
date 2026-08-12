const { Types } = require("mongoose");

const StudentLearningAccess = require("../models/StudentLearningAccess");
const Institute = require("../models/Institute");
const Topic = require("../models/Topic");
const SubTopic = require("../models/SubTopic");
const Student = require("../models/Student");
const VideoModule = require("../models/VideoModule");
const AudioModule = require("../models/AudioModule");
const TextModule = require("../models/TextModule");
const ExerciseModule = require("../models/ExerciseModule");
const VocabularyModule = require("../models/VocabularyModule");
const asyncHandler = require("../middlewares/asyncHandler");
const { sendResponse, sendError } = require("../utils/apiResponse");

// Every video/audio/text/exercise/vocabulary module document IS one lesson —
// there's no separate "lessons" field to read (see the models). So a
// subtopic's "lesson count" is just how many module documents across these
// five collections point at it.
const MODULE_COLLECTIONS = [
  { type: "video", collection: "videomodules", Model: VideoModule },
  { type: "audio", collection: "audiomodules", Model: AudioModule },
  { type: "text", collection: "textmodules", Model: TextModule },
  { type: "exercise", collection: "exercisemodules", Model: ExerciseModule },
  { type: "vocabulary", collection: "vocabularymodules", Model: VocabularyModule },
];

// $lookup + $count stages for every module collection against a subtopic
// (`$$subtopicId`), plus an $addFields that sums them into `lesson_count`.
// Reused by both the topics-by-course subtopic list and could be reused
// anywhere else a per-subtopic lesson count is needed.
const lessonCountStages = () => [
  ...MODULE_COLLECTIONS.map(({ type, collection }) => ({
    $lookup: {
      from: collection,
      let: { subtopicId: "$_id" },
      pipeline: [
        { $match: { $expr: { $eq: ["$sub_topic_id", "$$subtopicId"] }, is_active: true } },
        { $count: "n" },
      ],
      as: `_${type}_count`,
    },
  })),
  {
    $addFields: {
      lesson_count: {
        $add: MODULE_COLLECTIONS.map(({ type }) => ({
          $ifNull: [{ $arrayElemAt: [`$_${type}_count.n`, 0] }, 0],
        })),
      },
    },
  },
  { $project: Object.fromEntries(MODULE_COLLECTIONS.map(({ type }) => [`_${type}_count`, 0])) },
];

// Confirms course_id/topic_id are actually available to this institute
// (downloaded, and topic is part of the snapshot taken at download time),
// and that every subtopic_id genuinely belongs to that topic.
const assertCourseTopicSubtopics = async (institute, course_id, topic_id, subtopic_ids) => {
  const hasCourse = (institute.downloaded_course_ids ?? []).some(
    (id) => id.toString() === course_id,
  );
  if (!hasCourse) return "Course is not available to this institute. Download it first.";

  const snapshot = (institute.downloaded_topic_snapshot ?? []).find(
    (s) => s.course_id.toString() === course_id,
  );
  const hasTopic = (snapshot?.topic_ids ?? []).some((id) => id.toString() === topic_id);
  if (!hasTopic) return "Topic is not part of this institute's downloaded course content.";

  const subtopicCount = await SubTopic.countDocuments({
    _id: { $in: subtopic_ids },
    topic_id,
    is_active: true,
  });
  if (subtopicCount !== subtopic_ids.length) {
    return "One or more subtopics are invalid for the selected topic.";
  }

  return null;
};

// POST /institute/student-learning-access
const create = asyncHandler(async (req, res) => {
  const { course_id, topic_id, subtopic_ids, segment, year } = req.body;

  const institute = await Institute.findById(req.institute._id).select(
    "downloaded_course_ids downloaded_topic_snapshot",
  );
  if (!institute) return sendError(res, 404, false, "Institute not found.");

  const validationError = await assertCourseTopicSubtopics(
    institute,
    course_id,
    topic_id,
    subtopic_ids,
  );
  if (validationError) return sendError(res, 422, false, validationError);

  const access = await StudentLearningAccess.create({
    institute_id: req.institute._id,
    course_id,
    topic_id,
    subtopic_ids,
    segment,
    year,
  });

  return sendResponse(res, 201, true, "Student learning access configured successfully.", access);
});

const withDetails = (matchStage) => [
  { $match: matchStage },
  { $sort: { createdAt: -1 } },
  {
    $lookup: {
      from: "courses",
      localField: "course_id",
      foreignField: "_id",
      as: "course",
      pipeline: [{ $project: { course_name: 1, course_code: 1 } }],
    },
  },
  { $unwind: { path: "$course", preserveNullAndEmptyArrays: true } },
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
      localField: "subtopic_ids",
      foreignField: "_id",
      as: "subtopics",
      pipeline: [{ $project: { title: 1 } }],
    },
  },
  {
    $lookup: {
      from: "students",
      let: { institute_id: "$institute_id", segment: "$segment", year: "$year" },
      pipeline: [
        {
          $match: {
            $expr: {
              $and: [
                { $eq: ["$institute_id", "$$institute_id"] },
                { $eq: ["$segment", "$$segment"] },
                { $eq: ["$year", "$$year"] },
                { $eq: ["$status", "active"] },
              ],
            },
          },
        },
        { $count: "count" },
      ],
      as: "student_count_agg",
    },
  },
  {
    $addFields: {
      student_count: {
        $ifNull: [{ $arrayElemAt: ["$student_count_agg.count", 0] }, 0],
      },
    },
  },
  { $project: { student_count_agg: 0 } },
];

// GET /institute/student-learning-access
const getAll = asyncHandler(async (req, res) => {
  const matchStage = {
    institute_id: new Types.ObjectId(req.institute._id),
    is_active: true,
  };
  if (req.query.course_id) matchStage.course_id = new Types.ObjectId(req.query.course_id);
  if (req.query.topic_id) matchStage.topic_id = new Types.ObjectId(req.query.topic_id);

  let records = await StudentLearningAccess.aggregate(withDetails(matchStage));

  const search = req.query.search?.trim().toLowerCase();
  if (search) {
    records = records.filter(
      (r) =>
        r.course?.course_name?.toLowerCase().includes(search) ||
        r.topic?.title?.toLowerCase().includes(search) ||
        r.segment?.toLowerCase().includes(search) ||
        String(r.year).includes(search),
    );
  }

  return sendResponse(res, 200, true, "Student learning access list fetched.", {
    total: records.length,
    records,
  });
});

// GET /institute/student-learning-access/:id
const getOne = asyncHandler(async (req, res) => {
  const [record] = await StudentLearningAccess.aggregate(
    withDetails({
      _id: new Types.ObjectId(req.params.id),
      institute_id: new Types.ObjectId(req.institute._id),
    }),
  );
  if (!record) return sendError(res, 404, false, "Student learning access not found.");

  return sendResponse(res, 200, true, "Student learning access fetched.", record);
});

// PUT /institute/student-learning-access/:id
const update = asyncHandler(async (req, res) => {
  const access = await StudentLearningAccess.findOne({
    _id: req.params.id,
    institute_id: req.institute._id,
  });
  if (!access) return sendError(res, 404, false, "Student learning access not found.");

  const { course_id, topic_id, subtopic_ids, segment, year, is_active } = req.body;

  const nextCourseId = course_id ?? access.course_id.toString();
  const nextTopicId = topic_id ?? access.topic_id.toString();
  const nextSubtopicIds = subtopic_ids ?? access.subtopic_ids.map((id) => id.toString());

  if (course_id || topic_id || subtopic_ids) {
    const institute = await Institute.findById(req.institute._id).select(
      "downloaded_course_ids downloaded_topic_snapshot",
    );
    const validationError = await assertCourseTopicSubtopics(
      institute,
      nextCourseId,
      nextTopicId,
      nextSubtopicIds,
    );
    if (validationError) return sendError(res, 422, false, validationError);
  }

  if (course_id !== undefined) access.course_id = course_id;
  if (topic_id !== undefined) access.topic_id = topic_id;
  if (subtopic_ids !== undefined) access.subtopic_ids = subtopic_ids;
  if (segment !== undefined) access.segment = segment;
  if (year !== undefined) access.year = year;
  if (is_active !== undefined) access.is_active = is_active;

  await access.save();

  return sendResponse(res, 200, true, "Student learning access updated successfully.", access);
});

// DELETE /institute/student-learning-access/:id
const remove = asyncHandler(async (req, res) => {
  const access = await StudentLearningAccess.findOne({
    _id: req.params.id,
    institute_id: req.institute._id,
  });
  if (!access) return sendError(res, 404, false, "Student learning access not found.");

  access.is_active = false;
  await access.save();

  return sendResponse(res, 200, true, "Student learning access removed successfully.");
});

// GET /institute/student-learning-access/courses/:courseId/topics
// Topics available for a course, scoped to this institute's downloaded
// snapshot (a topic added to the course after the institute's last
// download/update stays hidden, same rule the student-facing topic list
// follows) — with subtopic counts, for the course/topic select on the form.
const getTopicsByCourse = asyncHandler(async (req, res) => {
  const { courseId } = req.params;

  const institute = await Institute.findById(req.institute._id).select(
    "downloaded_course_ids downloaded_topic_snapshot",
  );
  if (!institute) return sendError(res, 404, false, "Institute not found.");

  const hasCourse = (institute.downloaded_course_ids ?? []).some(
    (id) => id.toString() === courseId,
  );
  if (!hasCourse) return sendError(res, 422, false, "Course is not available to this institute.");

  const snapshot = (institute.downloaded_topic_snapshot ?? []).find(
    (s) => s.course_id.toString() === courseId,
  );
  const topicIds = snapshot?.topic_ids ?? [];
  if (!topicIds.length) return sendResponse(res, 200, true, "Topics fetched successfully.", []);

  const topics = await Topic.aggregate([
    { $match: { _id: { $in: topicIds }, is_active: true } },
    { $sort: { order: 1, createdAt: 1 } },
    {
      $lookup: {
        from: "subtopics",
        localField: "_id",
        foreignField: "topic_id",
        as: "subtopics",
        pipeline: [
          { $match: { is_active: true } },
          { $sort: { order: 1 } },
          { $project: { title: 1 } },
          ...lessonCountStages(),
        ],
      },
    },
    { $addFields: { subtopic_count: { $size: "$subtopics" } } },
  ]);

  return sendResponse(res, 200, true, "Topics fetched successfully.", topics);
});

// GET /institute/student-learning-access/subtopics/:subtopicId/modules
// Every real video/audio/text/exercise/vocabulary lesson under a subtopic —
// backs the "click a subtopic to see its lessons" popup on the form.
const getSubtopicModules = asyncHandler(async (req, res) => {
  const { subtopicId } = req.params;

  const subtopic = await SubTopic.findById(subtopicId).select("_id");
  if (!subtopic) return sendError(res, 404, false, "SubTopic not found.");

  const byType = await Promise.all(
    MODULE_COLLECTIONS.map(({ type, Model }) =>
      Model.find({ sub_topic_id: subtopic._id, is_active: true })
        .select("title order")
        .sort({ order: 1 })
        .lean()
        .then((docs) => docs.map((d) => ({ _id: d._id, title: d.title, type }))),
    ),
  );

  const modules = byType.flat();
  return sendResponse(res, 200, true, "Subtopic lessons fetched.", {
    total: modules.length,
    modules,
  });
});

// GET /institute/student-learning-access/departments
// Distinct segment ("department") + year ("batch") combinations actually
// present among this institute's students, with live student counts —
// backs the Department/Batch selects on the create/edit form.
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

module.exports = {
  create,
  getAll,
  getOne,
  update,
  remove,
  getDepartments,
  getTopicsByCourse,
  getSubtopicModules,
};
