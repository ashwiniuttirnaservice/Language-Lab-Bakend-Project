const express = require("express");

const router = express.Router();

router.use("/super-admin", require("./routes/superAdminRoutes"));
router.use("/license", require("./routes/licenseRoutes"));
router.use("/institute", require("./routes/instituteRoutes"));
router.use("/editor", require("./routes/editorRoutes"));
router.use("/student", require("./routes/studentRoutes"));
router.use("/topic", require("./routes/topicRoutes"));
router.use("/subtopic", require("./routes/subTopicRoutes"));
router.use("/module", require("./routes/moduleRoutes"));
router.use("/activity", require("./routes/activityRoutes"));
router.use("/progress", require("./routes/progressRoutes"));
router.use("/attendance", require("./routes/attendanceRoutes"));
router.use("/ai", require("./routes/aiRoutes"));

module.exports = router;
