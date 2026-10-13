const Joi = require("joi");

const submitAnswersSchema = Joi.object({
  answers: Joi.array()
    .items(
      Joi.object({
        question_index: Joi.number().integer().min(0).required(),
        given_answer: Joi.string().allow("").required(),
      }),
    )
    .min(1)
    .required(),
  time_spent_sec: Joi.number().min(0),
});

const saveProgressSchema = Joi.object({
  answers: Joi.array()
    .items(
      Joi.object({
        question_index: Joi.number().integer().min(0).required(),
        given_answer: Joi.string().allow("").required(),
      }),
    )
    .required(),
  remaining_time_sec: Joi.number().min(0),
});

module.exports = { submitAnswersSchema, saveProgressSchema };
