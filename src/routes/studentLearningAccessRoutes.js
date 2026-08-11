const express = require("express");
const router = express.Router();

const { validateSchema } = require("../middlewares/validate");
const protectInstitute = require("../middlewares/protectInstitute");
const authorizeRoles = require("../middlewares/authorizeRoles");
const {
  createStudentLearningAccessSchema,
  updateStudentLearningAccessSchema,
} = require("../validation/studentLearningAccessValidation");
const {
  create,
  getAll,
  getOne,
  update,
  remove,
  getDepartments,
  getTopicsByCourse,
  getSubtopicModules,
} = require("../controller/studentLearningAccessController");

// All routes here act on the logged-in institute's own data.
router.use(protectInstitute, authorizeRoles("institute"));

router.get("/departments", getDepartments);
router.get("/courses/:courseId/topics", getTopicsByCourse);
router.get("/subtopics/:subtopicId/modules", getSubtopicModules);
router.get("/", getAll);
router.get("/:id", getOne);
router.post("/", validateSchema(createStudentLearningAccessSchema), create);
router.put("/:id", validateSchema(updateStudentLearningAccessSchema), update);
router.delete("/:id", remove);

module.exports = router;
