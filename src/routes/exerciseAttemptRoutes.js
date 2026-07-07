const express = require("express");
const router = express.Router();

const protectStudent = require("../middlewares/protectStudent");
const authorizeRoles = require("../middlewares/authorizeRoles");
const { validateSchema } = require("../middlewares/validate");
const { submitAnswersSchema } = require("../validation/exerciseAttemptValidation");
const { submit, getResult, getMyAttempts } = require("../controller/exerciseAttemptController");

// Student — submit answers, view result / attempt history
router.post("/:id/submit", protectStudent, authorizeRoles("student"), validateSchema(submitAnswersSchema), submit);
router.get("/:id/result", protectStudent, authorizeRoles("student"), getResult);
router.get("/:id/attempts", protectStudent, authorizeRoles("student"), getMyAttempts);

module.exports = router;
