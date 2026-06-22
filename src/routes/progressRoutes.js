const express = require("express");
const router = express.Router();

const protectStudent = require("../middlewares/protectStudent");
const protectEditor = require("../middlewares/protectEditor");
const protectInstitute = require("../middlewares/protectInstitute");
const authorizeRoles = require("../middlewares/authorizeRoles");
const { getMyProgress, getStudentProgress } = require("../controller/progressController");

// Student — own progress
router.get("/me", protectStudent, authorizeRoles("student"), getMyProgress);

// Editor — view a student's progress
router.get("/student/:id", protectEditor, authorizeRoles("editor"), getStudentProgress);

// Institute — view a student's progress
router.get("/institute/student/:id", protectInstitute, authorizeRoles("institute"), getStudentProgress);

module.exports = router;
