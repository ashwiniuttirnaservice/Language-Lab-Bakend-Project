const express = require("express");

const router = express.Router();

router.use("/super-admin", require("./routes/superAdminRoutes"));
router.use("/license", require("./routes/licenseRoutes"));
// Alias — some frontends call license management under /admin/licenses.
// Same router/controllers as /license, just mounted at a second path.
router.use("/admin/licenses", require("./routes/licenseRoutes"));
router.use("/institute", require("./routes/instituteRoutes"));
router.use("/editor", require("./routes/editorRoutes"));
router.use("/student", require("./routes/studentRoutes"));
router.use("/practical", require("./routes/practicalRoutes"));
router.use("/task", require("./routes/taskRoutes"));
router.use("/subject", require("./routes/subjectRoutes"));
router.use("/assessment", require("./routes/assessmentRoutes"));
router.use("/topic", require("./routes/topicRoutes"));
router.use("/subtopic", require("./routes/subTopicRoutes"));
router.use("/module", require("./routes/moduleRoutes"));
router.use("/module/exercise", require("./routes/exerciseAttemptRoutes"));
router.use("/upload/chunk", require("./routes/chunkUploadRoutes"));
router.use("/activity", require("./routes/activityRoutes"));
router.use("/progress", require("./routes/progressRoutes"));
router.use("/attendance", require("./routes/attendanceRoutes"));
router.use("/ai", require("./routes/aiRoutes"));
router.use("/sync", require("./routes/syncRoutes"));

module.exports = router;
