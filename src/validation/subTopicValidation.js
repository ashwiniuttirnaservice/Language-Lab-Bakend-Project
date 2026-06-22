const Joi = require("joi");

const objectId = Joi.string().hex().length(24);

const createSubTopicSchema = Joi.object({
  topic_id: objectId.required(),
  title: Joi.string().trim().min(2).max(150).required(),
  description: Joi.string().trim().max(500),
  order: Joi.number().integer().min(0),
});

const updateSubTopicSchema = Joi.object({
  title: Joi.string().trim().min(2).max(150),
  description: Joi.string().trim().max(500),
  order: Joi.number().integer().min(0),
  is_active: Joi.boolean(),
});

module.exports = { createSubTopicSchema, updateSubTopicSchema };
