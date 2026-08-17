const mongoose = require("mongoose");

const Institute = require("../models/Institute");
const Course = require("../models/Course");
const Topic = require("../models/Topic");
const SubTopic = require("../models/SubTopic");
const VocabularyModule = require("../models/VocabularyModule");
const AudioModule = require("../models/AudioModule");
const VideoModule = require("../models/VideoModule");
const TextModule = require("../models/TextModule");
const ExerciseModule = require("../models/ExerciseModule");
const Subject = require("../models/Subject");
const Assessment = require("../models/Assessment");
const asyncHandler = require("../middlewares/asyncHandler");
const { sendResponse, sendError } = require("../utils/apiResponse");

// Authenticates a request against Institute.sync_api_key — deliberately NOT
// the institute JWT (protectInstitute), because the caller here is that
// institute's own separate local backend, not a logged-in browser session.
// A leaked key only ever exposes this one institute's own assigned course
// content, never database access — see Institute.js's sync_api_key comment.
const requireSyncKey = asyncHandler(async (req, res, next) => {
  const apiKey = req.header("x-sync-api-key");
  if (!apiKey) return sendError(res, 401, false, "Missing x-sync-api-key header.");

  const institute = await Institute.findOne({ sync_api_key: apiKey, is_active: true });
  if (!institute) return sendError(res, 401, false, "Invalid sync API key.");

  req.syncInstitute = institute;
  next();
});

// GET /sync/institute
// Returns the calling institute's own full record (matched by the sync key
// itself — no separate id needed, a key can only ever resolve to the one
// institute it belongs to). Lets a fresh local deployment mirror its own
// Institute document (including the hashed password, so the SAME email +
// password the institute already knows keeps working for local logins
// afterward) before it has anything else — see instituteController.login,
// which calls this on the very first local login when no local record
// exists yet, resolving the local DB's chicken-and-egg problem: you can't
// log in locally without a local Institute row, and you can't get one
// without first proving who you are.
const getInstituteSelf = asyncHandler(async (req, res) => {
  return sendResponse(res, 200, true, "Institute record fetched.", {
    institute: req.syncInstitute.toObject(),
  });
});

// GET /sync/course/:courseId
// Serves one course's full content tree (topics -> sub-topics -> every
// module type) as plain JSON, for an institute's own local backend to pull
// down and upsert into its own local database. This is the ONLY thing a
// sync key can reach — no raw DB access ever leaves this (master) server.
// Mirrors the aggregation instituteController.downloadCourseData already
// does for the "single shared DB" deployment mode; kept as a twin
// implementation rather than a shared helper so each can evolve for its
// very different caller (authenticated browser session vs. a server).
const getCourseBundle = asyncHandler(async (req, res) => {
  const { courseId } = req.params;
  if (!mongoose.Types.ObjectId.isValid(courseId)) {
    return sendError(res, 404, false, "Course not found.");
  }

  const institute = req.syncInstitute;
  const isAssigned = (institute.course_id || []).some(
    (id) => id.toString() === courseId,
  );
  if (!isAssigned) {
    return sendError(res, 403, false, "This course is not assigned to your institute.");
  }

  const course = await Course.findOne({ _id: courseId, is_active: true }).lean();
  if (!course) return sendError(res, 404, false, "Course not found.");

  const topics = await Topic.find({
    _id: { $in: course.topic_ids },
    is_active: true,
  })
    .sort({ order: 1 })
    .lean();
  const topicIds = topics.map((t) => t._id);

  const subTopics = await SubTopic.find({
    topic_id: { $in: topicIds },
    is_active: true,
  })
    .sort({ order: 1 })
    .lean();

  const [vocabulary, audio, video, text, exercise] = await Promise.all([
    VocabularyModule.find({ topic_id: { $in: topicIds }, is_active: true }).lean(),
    AudioModule.find({ topic_id: { $in: topicIds }, is_active: true }).lean(),
    VideoModule.find({ topic_id: { $in: topicIds }, is_active: true }).lean(),
    TextModule.find({ topic_id: { $in: topicIds }, is_active: true }).lean(),
    ExerciseModule.find({ topic_id: { $in: topicIds }, is_active: true }).lean(),
  ]);

  return sendResponse(res, 200, true, "Course bundle fetched.", {
    course,
    topics,
    subTopics,
    modules: { vocabulary, audio, video, text, exercise },
  });
});

// GET /sync/subjects
// Serves every active Subject + active Assessment as plain JSON, for an
// institute's own local backend to pull down and upsert into its own local
// database. Unlike getCourseBundle above, Subject/Assessment aren't scoped
// to a course or an institute (no course_id/institute_id on either model —
// same global-content shape as Course itself, just not download-gated by
// Institute.course_id/downloaded_course_ids), so this always returns the
// full current set rather than filtering by what's "assigned". Called
// alongside the course sync in instituteController.downloadCourseData
// (see masterSyncService.syncSubjectsFromMaster) so a local deployment's
// students see the same subjects/assessments as the shared-DB deployment
// the moment their institute next downloads any course.
const getSubjectsBundle = asyncHandler(async (req, res) => {
  const subjects = await Subject.find({ is_active: true }).lean();
  const assessments = await Assessment.find({ is_active: true }).lean();

  return sendResponse(res, 200, true, "Subjects bundle fetched.", {
    subjects,
    assessments,
  });
});

module.exports = { requireSyncKey, getInstituteSelf, getCourseBundle, getSubjectsBundle };
