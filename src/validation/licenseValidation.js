const Joi = require("joi");

const objectId = Joi.string().hex().length(24);

const generateSchema = Joi.object({
  institute_id: objectId.required(),
  total_seats: Joi.number().integer().min(1).default(5),
  duration: Joi.number().integer().min(1).required(), // days
  start_date: Joi.date().iso(),
});

const updateSeatsSchema = Joi.object({
  total_seats: Joi.number().integer().min(1).required(),
});

module.exports = { generateSchema, updateSeatsSchema };
