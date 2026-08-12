const express = require("express");
const router = express.Router();

const upload = require("../middlewares/uploads");
const protectEditor = require("../middlewares/protectEditor");
const protectUser = require("../middlewares/protectUser");
const authorizeRoles = require("../middlewares/authorizeRoles");
const { create, getBySubTopic, getOne, update, remove } = require("../controller/moduleController");
const { getCourseModuleCount } = require("../controller/courseController");

// Video/audio itself normally arrives pre-uploaded (via the chunked upload
// flow — see chunkUploadRoutes.js) with just its URL sent in the "video"/
// "audio" JSON field. thumbnailFile is small enough to skip chunking and
// ride along as a plain multipart file on the same create/update request,
// so both types accept it here alongside their (now usually-empty) media field.
const fileField = (type) => {
  if (type === "video")
    return upload.fields([
      { name: "videoFile", maxCount: 1 },
      { name: "thumbnailFile", maxCount: 1 },
    ]);
  if (type === "audio")
    return upload.fields([
      { name: "audioFile", maxCount: 1 },
      { name: "thumbnailFile", maxCount: 1 },
    ]);
  return (req, res, next) => next();
};

// Read — teacher or student
// GET /module/course/:courseId/count  — module count summary for a course
router.get("/course/:courseId/count", protectUser, async (req, res, next) => {
  // Reuse the same handler — map courseId param to id param
  req.params.id = req.params.courseId;
  return getCourseModuleCount(req, res, next);
});
// GET /module/:type?subtopic_id=xxx
router.get("/:type", protectUser, getBySubTopic);
// GET /module/:type/:id
router.get("/:type/:id", protectUser, getOne);

// Write — teacher only
router.post("/:type", protectEditor, authorizeRoles("editor"), (req, res, next) => {
  fileField(req.params.type)(req, res, next);
}, create);

router.put("/:type/:id", protectEditor, authorizeRoles("editor"), (req, res, next) => {
  fileField(req.params.type)(req, res, next);
}, update);

router.delete("/:type/:id", protectEditor, authorizeRoles("editor"), remove);

module.exports = router;
