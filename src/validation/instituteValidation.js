const Joi = require("joi");

const objectId = Joi.string().hex().length(24);

const createInstituteSchema = Joi.object({
  institute_name: Joi.string().trim().min(2).max(150).required(),
  institute_code: Joi.string().trim().uppercase().alphanum().min(2).max(20).required(),
  email: Joi.string().email().lowercase().required(),
  password: Joi.string().min(6).required(),
  phone: Joi.string().trim().min(7).max(15),
  address: Joi.string().trim().max(300),
  website: Joi.string().uri(),
  max_students: Joi.number().integer().min(1),
  course_id: Joi.alternatives().try(
    Joi.array().items(objectId).min(1),
    objectId
  ).required(),
});

const updateInstituteSchema = Joi.object({
  institute_name: Joi.string().trim().min(2).max(150),
  address: Joi.string().trim().max(300),
  phone: Joi.string().trim().min(7).max(15),
  website: Joi.string().uri(),
  max_students: Joi.number().integer().min(1),
  is_active: Joi.boolean(),
});

const assignLicenseSchema = Joi.object({
  license_id: objectId.required(),
});

const loginSchema = Joi.object({
  email: Joi.string().email().lowercase().required(),
  password: Joi.string().required(),
});

const updateMeSchema = Joi.object({
  institute_name: Joi.string().trim().min(2).max(150),
  address: Joi.string().trim().max(300),
  phone: Joi.string().trim().min(7).max(15),
  website: Joi.string().uri(),
});

module.exports = {
  createInstituteSchema,
  updateInstituteSchema,
  assignLicenseSchema,
  loginSchema,
  updateMeSchema,
};
