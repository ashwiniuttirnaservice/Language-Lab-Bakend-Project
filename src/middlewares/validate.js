const { validationResult } = require("express-validator");
const Joi = require("joi");
const { sendError } = require("../utils/apiResponse");

const validate = (req, res, next) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return sendError(
      res,
      422,
      false,
      "Validation failed. Please check the errors.",
      null,
      errors.array(),
    );
  }
  next();
};

const validateSchema =
  (schema, source = "body") =>
  (req, res, next) => {
    const { error, value } = schema.validate(req[source], {
      abortEarly: false,
      stripUnknown: true,
    });

    if (error) {
      const errors = error.details.map((d) => ({
        field: d.path.join("."),
        message: d.message.replace(/['"]/g, ""),
      }));
      return sendError(
        res,
        422,
        "Validation failed. Please check the errors.",
        errors,
      );
    }

    req[source] = value;
    next();
  };

module.exports = { validate, validateSchema };
