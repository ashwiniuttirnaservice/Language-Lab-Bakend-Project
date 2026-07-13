const express = require("express");
const router = express.Router();

const protectUser = require("../middlewares/protectUser");
const authorizeRoles = require("../middlewares/authorizeRoles");
const chunkUploadMiddleware = require("../middlewares/chunkUploadMiddleware");
const { initUpload, uploadChunk, getStatus, completeUpload } = require("../controller/chunkUploadController");

// Any authenticated uploader role — matches the set of roles that already
// upload files elsewhere in the app (editors: video/audio/profile photo,
// institutes: logo, super admins: profile image, students: profile photo).
const allowUploaders = authorizeRoles("editor", "institute", "super_admin", "student");

router.post("/init", protectUser, allowUploaders, initUpload);
router.get("/:uploadId/status", protectUser, allowUploaders, getStatus);
// Must be registered before "/:uploadId/:chunkIndex" — both are POST routes
// with the same two-segment shape, and Express matches in registration
// order, so the literal "complete" route would otherwise be shadowed by
// the chunk-index catch-all (chunkIndex="complete" -> NaN -> 400).
router.post("/:uploadId/complete", protectUser, allowUploaders, completeUpload);
router.post("/:uploadId/:chunkIndex", protectUser, allowUploaders, chunkUploadMiddleware, uploadChunk);

module.exports = router;
