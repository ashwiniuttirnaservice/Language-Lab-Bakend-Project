const axios = require("axios");

const Course = require("../models/Course");
const Topic = require("../models/Topic");
const SubTopic = require("../models/SubTopic");
const VocabularyModule = require("../models/VocabularyModule");
const AudioModule = require("../models/AudioModule");
const VideoModule = require("../models/VideoModule");
const TextModule = require("../models/TextModule");
const ExerciseModule = require("../models/ExerciseModule");
const Institute = require("../models/Institute");
const logger = require("../utils/logger");

const MODULE_MODEL_BY_TYPE = {
  vocabulary: VocabularyModule,
  audio: AudioModule,
  video: VideoModule,
  text: TextModule,
  exercise: ExerciseModule,
};

// Set only on a deployment that runs against its OWN local database and
// needs to pull course content down from the shared/master server instead
// of already having it (see routes/syncRoutes.js on the master side). Off
// by default — every institute on the single shared database (today's
// normal setup) never hits this, downloadCourseData reads its own DB directly.
const isSyncEnabled = () => !!process.env.MASTER_API_URL;

// Upserts one document into `Model` keyed by its MASTER _id — keeping ids
// identical between master and local means every foreign-key reference
// (topic_id, sub_topic_id, course.topic_ids, ...) still resolves correctly
// once mirrored locally, and re-syncing later just refreshes fields in place
// rather than creating duplicates.
async function upsertById(Model, doc) {
  const { _id, ...rest } = doc;
  await Model.findOneAndUpdate(
    { _id },
    { $set: rest },
    { upsert: true, setDefaultsOnInsert: true },
  );
}

// Pulls one course's full content tree from the master server (GET
// /sync/course/:courseId, authenticated with this institute's own
// sync_api_key — never a database credential) and mirrors it into this
// backend's own local database. Called from
// instituteController.downloadCourseData in place of reading
// Course/Topic/... directly, only when isSyncEnabled().
async function syncCourseFromMaster(courseId, instituteId) {
  const response = await axios.get(
    `${process.env.MASTER_API_URL}/api/sync/course/${courseId}`,
    { headers: { "x-sync-api-key": process.env.SYNC_API_KEY } },
  );
  const { course, topics, subTopics, modules } = response.data.data;

  await upsertById(Course, course);
  await Promise.all(topics.map((t) => upsertById(Topic, t)));
  await Promise.all(subTopics.map((s) => upsertById(SubTopic, s)));

  await Promise.all(
    Object.entries(MODULE_MODEL_BY_TYPE).map(([type, Model]) =>
      Promise.all((modules[type] || []).map((m) => upsertById(Model, m))),
    ),
  );

  // Master already verified this course is assigned to the institute before
  // returning any data (see syncController.getCourseBundle) — mirror that
  // assignment onto the local Institute record too, so the plain local-DB
  // assignment check right after this call (and on every later request)
  // recognizes it without needing its own separate sync step.
  await Institute.updateOne(
    { _id: instituteId },
    { $addToSet: { course_id: courseId } },
  );

  logger.info(
    `Synced course ${courseId} from master: ${topics.length} topics, ${subTopics.length} sub-topics.`,
  );
}

// Mirrors THIS institute's own record from master into the local DB —
// including its hashed password, so the same email/password the institute
// already logs in with on master keeps working locally too. See
// instituteController.login: called only when a local login is attempted
// and no local Institute row exists yet for that email (first-ever local
// login), which is also the only time it's actually needed again — every
// login after that finds the now-mirrored row locally and skips this.
async function syncInstituteFromMaster() {
  const response = await axios.get(
    `${process.env.MASTER_API_URL}/api/sync/institute`,
    { headers: { "x-sync-api-key": process.env.SYNC_API_KEY } },
  );
  const institute = response.data.data.institute;
  const { _id, ...rest } = institute;

  await Institute.findOneAndUpdate(
    { _id },
    { $set: rest },
    { upsert: true, setDefaultsOnInsert: true },
  );

  logger.info(`Synced institute ${_id} (${institute.email}) from master.`);
  return _id;
}

module.exports = { isSyncEnabled, syncCourseFromMaster, syncInstituteFromMaster };
