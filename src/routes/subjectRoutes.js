const express = require("express");
const router = express.Router();

const { validateSchema } = require("../middlewares/validate");
const { createSubjectSchema, updateSubjectSchema } = require("../validation/subjectValidation");
const { create, getAll, getOne, update, remove } = require("../controller/subjectController");

router.get("/", getAll);
router.get("/:id", getOne);
router.post("/", validateSchema(createSubjectSchema), create);
router.put("/:id", validateSchema(updateSubjectSchema), update);
router.delete("/:id", remove);

module.exports = router;
