const express = require("express");
const router = express.Router();

const { validateSchema } = require("../middlewares/validate");
const protectStudent = require("../middlewares/protectStudent");
const authorizeRoles = require("../middlewares/authorizeRoles");
const { askAiSchema } = require("../validation/activityValidation");
const { ask, getHistory } = require("../controller/aiController");

router.post("/ask", protectStudent, authorizeRoles("student"), validateSchema(askAiSchema), ask);
router.get("/history", protectStudent, authorizeRoles("student"), getHistory);

module.exports = router;
