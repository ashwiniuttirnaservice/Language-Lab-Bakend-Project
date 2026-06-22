const Joi = require("joi");

const objectId = Joi.string().hex().length(24);

const createStudentSchema = Joi.object({
  full_name: Joi.string().trim().min(2).max(100).required(),
  email: Joi.string().email().lowercase(),          // optional — not used for login
  phone: Joi.string().trim().min(7).max(15),
  roll_no: Joi.string().trim().required(),
  enrollment_no: Joi.string().trim().required(),    // required — used as login username
  batch: Joi.string().trim(),
  course: Joi.string().trim(),
  year: Joi.number().integer().min(1).max(6),
  institute_id: objectId.required(),
});

const updateStudentSchema = Joi.object({
  full_name: Joi.string().trim().min(2).max(100),
  phone: Joi.string().trim().min(7).max(15),
  roll_no: Joi.string().trim(),
  enrollment_no: Joi.string().trim(),
  batch: Joi.string().trim(),
  course: Joi.string().trim(),
  year: Joi.number().integer().min(1).max(6),
  status: Joi.string().valid("active", "inactive", "suspended"),
  is_active: Joi.boolean(),
});

const updateMeSchema = Joi.object({
  full_name: Joi.string().trim().min(2).max(100),
  phone: Joi.string().trim().min(7).max(15),
});

const loginSchema = Joi.object({
  enrollment_no: Joi.string().trim().required(),
});

const changePasswordSchema = Joi.object({
  current_password: Joi.string().required(),
  new_password: Joi.string().min(6).required(),
});

module.exports = {
  createStudentSchema,
  updateStudentSchema,
  updateMeSchema,
  loginSchema,
  changePasswordSchema,
};
