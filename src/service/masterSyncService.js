const axios = require("axios");
const bcrypt = require("bcryptjs");

const Course = require("../models/Course");
const Topic = require("../models/Topic");
const SubTopic = require("../models/SubTopic");
const VocabularyModule = require("../models/VocabularyModule");
const AudioModule = require("../models/AudioModule");
const VideoModule = require("../models/VideoModule");
const TextModule = require("../models/TextModule");
const ExerciseModule = require("../models/ExerciseModule");
const Institute = require("../models/Institute");
const License = require("../models/License");
const Subject = require("../models/Subject");
const Assessment = require("../models/Assessment");
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

// Fallback for syncInstituteFromMaster() above — that one depends on
// GET /api/sync/institute + SYNC_API_KEY, which isn't available on every
// master deployment. This instead calls the ALWAYS-available public
// POST /api/institute/login with the same email/password the institute is
// already logging in with here, which both verifies the credentials against
// master AND issues a master token. That login response alone only carries a
// handful of fields (name/code/email/logo/is_active) though — immediately
// follow it up with GET /institute/me using that same token to pull the FULL
// record (address, phone, website, course_id, license_ids, max_students, ...)
// and mirror ALL of it locally. The password itself is never returned by
// either endpoint (by design), so it's hashed fresh right here from the
// plaintext password already in hand — equally secure, just a locally-made
// hash instead of a copy of master's.
async function syncInstituteFromPublicLogin(email, password) {
  const loginResponse = await axios.post(
    `${process.env.MASTER_API_URL}/api/institute/login`,
    { email, password },
  );
  const { token: masterToken, institute: loginInstitute } = loginResponse.data.data;

  let fullInstitute = loginInstitute;
  try {
    const meResponse = await axios.get(`${process.env.MASTER_API_URL}/api/institute/me`, {
      headers: { Authorization: `Bearer ${masterToken}` },
    });
    fullInstitute = meResponse.data.data;
  } catch (error) {
    // Falls back to the minimal login payload above — still enough to log
    // in locally, just missing the extra fields /me would have added.
    logger.error(`Institute /me fetch failed during sync for ${email}: ${error.message}`);
  }

  const instituteId = fullInstitute._id || fullInstitute.id;
  const hashedPassword = await bcrypt.hash(password, 12);

  // Strip aggregation-only/derived fields (license, editors, courses — added
  // by master's getMe lookups, not real Institute columns) and anything that
  // must come from THIS sync call rather than be copied verbatim (password,
  // _id/id, __v, timestamps, and the institute's own OTP state — copying a
  // stale otp_code/otp_expires_at down from master could otherwise collide
  // with this institute's separate local OTP flow).
  const {
    _id, id, password: _password, license, editors, courses,
    __v, createdAt, updatedAt, otp_code, otp_expires_at,
    ...rest
  } = fullInstitute;

  await Institute.findOneAndUpdate(
    { _id: instituteId },
    {
      $set: {
        ...rest,
        password: hashedPassword,
        role: "institute",
      },
    },
    { upsert: true, setDefaultsOnInsert: true },
  );

  // Also mirror this institute's licenses — without at least one active
  // License row locally, getPublicList() (student-login's "select license
  // code" dropdown) filters this institute out entirely, even once it has a
  // valid Institute row and downloaded courses. Best-effort: a failure here
  // shouldn't break institute login, just leave licenses to sync next time.
  try {
    await syncLicensesFromMaster(instituteId, masterToken);
  } catch (error) {
    logger.error(`License sync failed during institute sync for ${email}: ${error.message}`);
  }

  logger.info(`Synced institute ${instituteId} (${email}) from master via public login + /me.`);
  return instituteId;
}

// Pulls every license this institute owns from master's protected
// GET /institute/me/licenses (the same route the local backend's own
// licenseApi.getInstituteLicenses would eventually hit once it has data) and
// mirrors each one into local Mongo, keyed by master's _id. Called from
// syncInstituteFromPublicLogin, reusing the master token obtained there.
async function syncLicensesFromMaster(instituteId, masterToken) {
  const response = await axios.get(`${process.env.MASTER_API_URL}/api/institute/me/licenses`, {
    headers: { Authorization: `Bearer ${masterToken}` },
  });
  const { licenses } = response.data.data;

  await Promise.all(licenses.map((l) => upsertById(License, l)));

  logger.info(`Synced ${licenses.length} license(s) for institute ${instituteId} from master.`);
}

// Fallback for syncCourseFromMaster() above — that one depends on
// GET /api/sync/course/:id + SYNC_API_KEY, which isn't available on every
// master deployment. This instead calls the ALWAYS-available (auth-protected)
// public GET /api/institute/me/courses/:courseId/download, using the SAME
// master-issued institute token the frontend already holds from its own
// direct master login (forwarded here via the x-master-token header — see
// courseApi.downloadCourse + instituteController.downloadCourseData). That
// response is the exact same course/topics/sub_topics/modules tree, just
// nested instead of split into flat arrays, so it's flattened here before
// mirroring into local Mongo. Once mirrored, the rest of downloadCourseData
// (video caching to local disk, etc.) runs unchanged, reading these rows back
// out of the local DB exactly like the SYNC_API_KEY path would have left them.
async function syncCourseFromPublicDownload(courseId, instituteId, masterToken) {
  const response = await axios.get(
    `${process.env.MASTER_API_URL}/api/institute/me/courses/${courseId}/download`,
    { headers: { Authorization: `Bearer ${masterToken}` } },
  );
  const { course, topics } = response.data.data;

  await upsertById(Course, course);

  await Promise.all(
    topics.map((t) => {
      const { sub_topics, ...topicDoc } = t;
      return upsertById(Topic, topicDoc);
    }),
  );

  const subTopics = topics.flatMap((t) => t.sub_topics || []);
  await Promise.all(
    subTopics.map((st) => {
      const { modules, ...subTopicDoc } = st;
      return upsertById(SubTopic, subTopicDoc);
    }),
  );

  const modules = subTopics.flatMap((st) => st.modules || []);
  await Promise.all(
    modules.map((m) => {
      const Model = MODULE_MODEL_BY_TYPE[m.module_type];
      return Model ? upsertById(Model, m) : Promise.resolve();
    }),
  );

  await Institute.updateOne(
    { _id: instituteId },
    { $addToSet: { course_id: courseId } },
  );

  logger.info(
    `Synced course ${courseId} from master via public download: ${topics.length} topics, ${subTopics.length} sub-topics, ${modules.length} modules.`,
  );
}

// Pulls every active Subject + Assessment from master and mirrors them into
// the local DB, keyed by master's _id. Unlike courses, Subject/Assessment
// aren't tied to a course or gated by Institute.course_id — this is a flat
// "grab everything current" sync, called best-effort alongside the course
// sync in instituteController.downloadCourseData so a local deployment's
// students end up seeing the same Subjects/Assessments as the shared-DB
// deployment.
//
// Deliberately hits master's plain GET /api/subject + GET /api/assessment
// instead of a sync_api_key-gated /sync/subjects route — both are already
// open, unauthenticated endpoints on master (see subjectRoutes.js /
// assessmentRoutes.js), so this needs neither SYNC_API_KEY nor any new
// master-side sync route to exist; it works the moment master has the
// Subject/Assessment feature deployed at all, same as any other client
// hitting those routes.
async function syncSubjectsFromMaster() {
  const [subjectsRes, assessmentsRes] = await Promise.all([
    axios.get(`${process.env.MASTER_API_URL}/api/subject`),
    axios.get(`${process.env.MASTER_API_URL}/api/assessment`),
  ]);
  const subjects = subjectsRes.data?.data || [];
  // GET /api/assessment populates subject_id -> { _id, title } for display
  // purposes — flatten it back to a plain id before upserting, so the local
  // Assessment's subject_id stays a real reference instead of an embedded object.
  const assessments = (assessmentsRes.data?.data || []).map((a) => ({
    ...a,
    subject_id: a.subject_id?._id || a.subject_id,
  }));

  await Promise.all(subjects.map((s) => upsertById(Subject, s)));
  await Promise.all(assessments.map((a) => upsertById(Assessment, a)));

  logger.info(
    `Synced ${subjects.length} subject(s) and ${assessments.length} assessment(s) from master.`,
  );
}

module.exports = {
  isSyncEnabled,
  syncCourseFromMaster,
  syncCourseFromPublicDownload,
  syncInstituteFromMaster,
  syncInstituteFromPublicLogin,
  syncLicensesFromMaster,
  syncSubjectsFromMaster,
};
