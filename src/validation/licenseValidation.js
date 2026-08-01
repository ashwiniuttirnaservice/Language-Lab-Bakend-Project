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

// PUT /license/:id — generic admin edit (any subset of these fields)
const updateLicenseSchema = Joi.object({
  status: Joi.string().valid("active", "expired", "revoked", "suspended"),
  start_date: Joi.date().iso(),
  expiry_date: Joi.date().iso(),
  total_seats: Joi.number().integer().min(1),
}).min(1);

module.exports = { generateSchema, updateSeatsSchema, updateLicenseSchema };
