const Joi = require("joi");

const objectId = Joi.string().hex().length(24);

const addressSchema = Joi.object({
  line1: Joi.string().trim().max(200),
  line2: Joi.string().trim().max(200).allow(""),
  pincode: Joi.string().trim().max(10),
  state: Joi.string().trim().max(100),
  dist: Joi.string().trim().max(100),
  taluka: Joi.string().trim().max(100),
  autorizedName: Joi.string().trim().max(150),
  autorizedPhono: Joi.string().trim().max(15),
  nearbyLandmarks: Joi.string().trim().max(300),
});

const createInstituteSchema = Joi.object({
  institute_name: Joi.string().trim().min(2).max(150).required(),
  institute_code: Joi.string().trim().uppercase().alphanum().min(2).max(20).required(),
  email: Joi.string().email().lowercase().required(),
  password: Joi.string().min(6).required(),
  phone: Joi.string().trim().min(7).max(15),
  address: addressSchema,
  website: Joi.string().uri(),
  max_students: Joi.number().integer().min(1),
  course_id: Joi.alternatives().try(
    Joi.array().items(objectId).min(1),
    objectId
  ).required(),
});

const updateInstituteSchema = Joi.object({
  institute_name: Joi.string().trim().min(2).max(150),
  institute_code: Joi.string().trim().uppercase().alphanum().min(2).max(20),
  email: Joi.string().email().lowercase(),
  password: Joi.string().min(6),
  address: addressSchema,
  phone: Joi.string().trim().min(7).max(15),
  website: Joi.string().uri(),
  max_students: Joi.number().integer().min(1),
  is_active: Joi.boolean(),
  course_id: Joi.alternatives().try(
    Joi.array().items(objectId).min(1),
    objectId
  ),
});

const updateAddressSchema = Joi.object({
  line1: Joi.string().trim().max(200),
  line2: Joi.string().trim().max(200).allow(""),
  pincode: Joi.string().trim().max(10),
  state: Joi.string().trim().max(100),
  dist: Joi.string().trim().max(100),
  taluka: Joi.string().trim().max(100),
  autorizedName: Joi.string().trim().max(150),
  autorizedPhono: Joi.string().trim().max(15),
  nearbyLandmarks: Joi.string().trim().max(300),
}).min(1);

const assignLicenseSchema = Joi.object({
  license_id: objectId.required(),
});

const loginSchema = Joi.object({
  email: Joi.string().email().lowercase().required(),
  password: Joi.string().required(),
});

const updateMeSchema = Joi.object({
  institute_name: Joi.string().trim().min(2).max(150),
  address: addressSchema,
  phone: Joi.string().trim().min(7).max(15),
  website: Joi.string().uri(),
});

module.exports = {
  createInstituteSchema,
  updateInstituteSchema,
  updateAddressSchema,
  assignLicenseSchema,
  loginSchema,
  updateMeSchema,
};
