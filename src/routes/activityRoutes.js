const express = require("express");
const router = express.Router();

const { validateSchema } = require("../middlewares/validate");
const protectStudent = require("../middlewares/protectStudent");
const protectEditor = require("../middlewares/protectEditor");
const protectInstitute = require("../middlewares/protectInstitute");
const authorizeRoles = require("../middlewares/authorizeRoles");
const { logActivitySchema } = require("../validation/activityValidation");
const { log, getMyActivity, getStudentActivity } = require("../controller/activityController");

// Student
router.post("/", protectStudent, authorizeRoles("student"), validateSchema(logActivitySchema), log);
router.get("/me", protectStudent, authorizeRoles("student"), getMyActivity);

// Teacher or College
router.get("/student/:id", protectEditor, authorizeRoles("editor"), getStudentActivity);

module.exports = router;
