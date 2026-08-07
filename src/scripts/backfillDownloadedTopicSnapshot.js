// One-time migration: seeds `downloaded_topic_snapshot` for institutes that
// downloaded a course before the snapshot feature existed. Without this,
// those courses keep falling back to live `course.topic_ids`, so a topic
// added to the course today shows to students immediately instead of
// waiting for the next "Download"/"Update Data".
//
// Baseline chosen: the course's *current* topic_ids at the moment this
// script runs — we have no record of what it looked like at the original
// download time, so "now" is the safest baseline (anything added after
// running this script will correctly stay hidden until the next update).
//
// Usage: node src/scripts/backfillDownloadedTopicSnapshot.js

require("dotenv").config();
const mongoose = require("mongoose");
const connectDB = require("../config/db");
const Institute = require("../models/Institute");
const Course = require("../models/Course");

const run = async () => {
  await connectDB();

  const institutes = await Institute.find({
    downloaded_course_ids: { $exists: true, $not: { $size: 0 } },
  }).select("institute_name downloaded_course_ids downloaded_topic_snapshot");

  let updatedInstitutes = 0;
  let seededCourses = 0;

  for (const institute of institutes) {
    const alreadySnapshotted = new Set(
      (institute.downloaded_topic_snapshot || []).map((s) => s.course_id.toString()),
    );

    const missingCourseIds = institute.downloaded_course_ids.filter(
      (id) => !alreadySnapshotted.has(id.toString()),
    );
    if (!missingCourseIds.length) continue;

    const courses = await Course.find(
      { _id: { $in: missingCourseIds } },
      { topic_ids: 1 },
    ).lean();

    const newEntries = courses.map((c) => ({
      course_id: c._id,
      topic_ids: c.topic_ids,
    }));
    if (!newEntries.length) continue;

    await Institute.updateOne(
      { _id: institute._id },
      { $push: { downloaded_topic_snapshot: { $each: newEntries } } },
    );

    updatedInstitutes += 1;
    seededCourses += newEntries.length;
    console.log(
      `Seeded ${newEntries.length} course snapshot(s) for "${institute.institute_name}".`,
    );
  }

  console.log(
    `\nDone. ${updatedInstitutes} institute(s) updated, ${seededCourses} course snapshot(s) seeded.`,
  );
  await mongoose.disconnect();
  process.exit(0);
};

run().catch((error) => {
  console.error("Backfill failed:", error);
  process.exit(1);
});
