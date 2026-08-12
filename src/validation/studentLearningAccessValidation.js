const Joi = require("joi");

const objectId = Joi.string().hex().length(24);

const createStudentLearningAccessSchema = Joi.object({
  course_id: objectId.required(),
  topic_id: objectId.required(),
  subtopic_ids: Joi.array().items(objectId).min(1).required(),
  segment: Joi.string().trim().min(1).max(120).required(),
  // Year of study (1st/2nd/... year), same range as Student.year — not a
  // calendar year. See studentValidation.js.
  year: Joi.number().integer().min(1).max(6).required(),
});

const updateStudentLearningAccessSchema = Joi.object({
  course_id: objectId,
  topic_id: objectId,
  subtopic_ids: Joi.array().items(objectId).min(1),
  segment: Joi.string().trim().min(1).max(120),
  year: Joi.number().integer().min(1).max(6),
  is_active: Joi.boolean(),
});

module.exports = {
  createStudentLearningAccessSchema,
  updateStudentLearningAccessSchema,
};
