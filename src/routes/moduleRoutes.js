const express = require("express");
const router = express.Router();

const upload = require("../middlewares/uploads");
const protectEditor = require("../middlewares/protectEditor");
const protectUser = require("../middlewares/protectUser");
const authorizeRoles = require("../middlewares/authorizeRoles");
const { create, getBySubTopic, getOne, update, remove } = require("../controller/moduleController");
const { getCourseModuleCount } = require("../controller/courseController");

const fileField = (type) => {
  if (type === "video") return upload.single("videoFile");
  if (type === "audio") return upload.single("audioFile");
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
