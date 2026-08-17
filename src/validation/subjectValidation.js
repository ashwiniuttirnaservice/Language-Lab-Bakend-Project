const Joi = require("joi");

const createSubjectSchema = Joi.object({
  title: Joi.string().trim().min(2).max(150).required(),
  description: Joi.string().trim().max(500).allow(""),
});

const updateSubjectSchema = Joi.object({
  title: Joi.string().trim().min(2).max(150),
  description: Joi.string().trim().max(500).allow(""),
  is_active: Joi.boolean(),
});

module.exports = { createSubjectSchema, updateSubjectSchema };
