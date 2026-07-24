const mongoose = require("mongoose");
const logger = require("./logger");

const Institute = require("../models/Institute");
const Course = require("../models/Course");
const Topic = require("../models/Topic");
const SubTopic = require("../models/SubTopic");
const VocabularyModule = require("../models/VocabularyModule");
const AudioModule = require("../models/AudioModule");
const VideoModule = require("../models/VideoModule");
const TextModule = require("../models/TextModule");
const ExerciseModule = require("../models/ExerciseModule");
const Student = require("../models/Student");
const StudentProgress = require("../models/StudentProgress");
const StudentModuleAttempt = require("../models/StudentModuleAttempt");
const ChatHistory = require("../models/ChatHistory");
const ActivityLog = require("../models/ActivityLog");
const Attendance = require("../models/Attendance");
const Session = require("../models/Session");

// Same collection names/schemas as the main database — cloned onto the
// institute's own (local) database so downloaded content mirrors 1:1 into it.
const SOURCE_MODELS = {
  Institute,
  Course,
  Topic,
  SubTopic,
  VocabularyModule,
  AudioModule,
  VideoModule,
  TextModule,
  ExerciseModule,
  Student,
  StudentProgress,
  StudentModuleAttempt,
  ChatHistory,
  ActivityLog,
  Attendance,
  Session,
};

let instituteConnection = null;

// A genuinely separate MongoDB connection — the institute's own local
// database (e.g. on their own machine), independent of the master's
// Atlas connection. Created lazily, once, on first use.
function getInstituteDb() {
  if (!instituteConnection) {
    instituteConnection = mongoose.createConnection(process.env.INSTITUTE_MONGO_URI);
    instituteConnection.on("error", (error) => {
      logger.error(`Institute local DB connection error: ${error.message}`);
    });

    for (const [name, sourceModel] of Object.entries(SOURCE_MODELS)) {
      instituteConnection.model(name, sourceModel.schema);
    }
  }

  return instituteConnection;
}

// Upserts each doc (by _id) into Model — mirrors main-DB documents into the
// institute's local database without duplicating on repeat logins/downloads.
async function upsertAll(Model, docs) {
  if (!docs || !docs.length) return;
  await Model.bulkWrite(
    docs.map((doc) => ({
      updateOne: {
        filter: { _id: doc._id },
        update: { $set: doc },
        upsert: true,
      },
    })),
  );
}

// Best-effort mirror of one doc into a named local collection. Never throws
// into the caller — a failed mirror must not fail the original write.
async function mirrorToLocal(modelName, doc) {
  if (!doc) return;
  try {
    const instituteDb = getInstituteDb();
    await upsertAll(instituteDb.model(modelName), [
      doc.toObject ? doc.toObject() : doc,
    ]);
  } catch (error) {
    logger.error(`Per-institute DB mirror failed for ${modelName} ${doc._id}: ${error.message}`);
  }
}

module.exports = { getInstituteDb, upsertAll, mirrorToLocal };
