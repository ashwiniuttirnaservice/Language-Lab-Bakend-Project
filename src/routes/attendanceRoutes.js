const express = require("express");
const router = express.Router();

const protectStudent = require("../middlewares/protectStudent");
const protectEditor = require("../middlewares/protectEditor");
const protectInstitute = require("../middlewares/protectInstitute");
const authorizeRoles = require("../middlewares/authorizeRoles");
const { getMyAttendance, getStudentAttendance, getInstituteAttendance } = require("../controller/attendanceController");

// Student — own attendance
router.get("/me", protectStudent, authorizeRoles("student"), getMyAttendance);

// Editor — view a student's attendance
router.get("/student/:id", protectEditor, authorizeRoles("editor"), getStudentAttendance);

// Institute — view all students or a specific student
router.get("/institute/all", protectInstitute, authorizeRoles("institute"), getInstituteAttendance);
router.get("/institute/student/:id", protectInstitute, authorizeRoles("institute"), getStudentAttendance);

module.exports = router;
