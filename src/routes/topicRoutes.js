const express = require("express");
const router = express.Router();

const { validateSchema } = require("../middlewares/validate");
const protectEditor = require("../middlewares/protectEditor");
const protectUser = require("../middlewares/protectUser");
const authorizeRoles = require("../middlewares/authorizeRoles");
const { createTopicSchema, updateTopicSchema } = require("../validation/topicValidation");
const { create, getAll, getOne, update, remove } = require("../controller/topicController");

// Read — teacher or student
router.get("/", protectUser, getAll);
router.get("/:id", protectUser, getOne);

// Write — teacher only
router.post("/", protectEditor, authorizeRoles("editor"), validateSchema(createTopicSchema), create);
router.put("/:id", protectEditor, authorizeRoles("editor"), validateSchema(updateTopicSchema), update);
router.delete("/:id", protectEditor, authorizeRoles("editor"), remove);

module.exports = router;
