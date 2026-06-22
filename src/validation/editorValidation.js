const Joi = require("joi");

const objectId = Joi.string().hex().length(24);

const createEditorSchema = Joi.object({
  full_name: Joi.string().trim().min(2).max(100).required(),
  email: Joi.string().email().lowercase().required(),
  password: Joi.string().min(6).required(),
  phone: Joi.string().trim().min(7).max(15),
  assigned_institutes: Joi.alternatives().try(
    Joi.array().items(objectId),
    Joi.string(),
  ).optional(),
});

const updateEditorSchema = Joi.object({
  full_name: Joi.string().trim().min(2).max(100),
  phone: Joi.string().trim().min(7).max(15),
  status: Joi.string().valid("active", "inactive", "suspended"),
  is_active: Joi.boolean(),
});

const updateMeSchema = Joi.object({
  full_name: Joi.string().trim().min(2).max(100),
  phone: Joi.string().trim().min(7).max(15),
});

const loginSchema = Joi.object({
  email: Joi.string().email().lowercase().required(),
  password: Joi.string().required(),
});

const assignInstituteSchema = Joi.object({
  institute_ids: Joi.array().items(objectId).min(1).required(),
});

const changePasswordSchema = Joi.object({
  current_password: Joi.string().required(),
  new_password: Joi.string().min(6).required(),
});

module.exports = {
  createEditorSchema,
  updateEditorSchema,
  updateMeSchema,
  loginSchema,
  assignInstituteSchema,
  changePasswordSchema,
};
