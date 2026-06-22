const express = require("express");
const router = express.Router();

const { validateSchema } = require("../middlewares/validate");
const protectEditor = require("../middlewares/protectEditor");
const protectUser = require("../middlewares/protectUser");
const authorizeRoles = require("../middlewares/authorizeRoles");
const { createSubTopicSchema, updateSubTopicSchema } = require("../validation/subTopicValidation");
const { create, getByTopic, getOne, update, remove } = require("../controller/subTopicController");

// Read — teacher or student
router.get("/topic/:topicId", protectUser, getByTopic);
router.get("/:id", protectUser, getOne);

// Write — teacher only
router.post("/", protectEditor, authorizeRoles("editor"), validateSchema(createSubTopicSchema), create);
router.put("/:id", protectEditor, authorizeRoles("editor"), validateSchema(updateSubTopicSchema), update);
router.delete("/:id", protectEditor, authorizeRoles("editor"), remove);

module.exports = router;
