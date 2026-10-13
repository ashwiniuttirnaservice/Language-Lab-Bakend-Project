const express = require("express");
const router = express.Router();

const {
  requireSyncKey,
  getInstituteSelf,
  getCourseBundle,
} = require("../controller/syncController");

// No protectInstitute/JWT here on purpose — the caller is a server (an
// institute's own local backend), not a browser session. Auth is the
// x-sync-api-key header instead, checked in requireSyncKey.
//
// Subjects/Assessments have no equivalent /sync/subjects route here — they're
// synced by masterSyncService.syncSubjectsFromMaster hitting the plain, already
// -open GET /api/subject + GET /api/assessment instead, so no key is needed.
router.get("/institute", requireSyncKey, getInstituteSelf);
router.get("/course/:courseId", requireSyncKey, getCourseBundle);

module.exports = router;
