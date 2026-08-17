const Joi = require("joi");

const objectId = Joi.string().hex().length(24);

const questionSchema = Joi.object({
  question_text: Joi.string().trim().required(),
  optionA: Joi.string().trim().required(),
  optionB: Joi.string().trim().required(),
  optionC: Joi.string().trim().allow(""),
  optionD: Joi.string().trim().allow(""),
  correct_answer: Joi.string().required(),
  explanation: Joi.string().allow(""),
  hint: Joi.string().allow(""),
  marks: Joi.number(),
  negative_marks: Joi.number(),
});

const createAssessmentSchema = Joi.object({
  subject_id: objectId.required(),
  title: Joi.string().trim().min(2).max(150).required(),
  description: Joi.string().trim().allow(""),
  order: Joi.number().integer().min(0),
  exercise_type: Joi.string().required(),
  difficulty: Joi.string().valid("easy", "medium", "hard"),
  questions: Joi.array().items(questionSchema),
  shuffle_questions: Joi.boolean(),
  shuffle_options: Joi.boolean(),
  show_explanation: Joi.boolean(),
  total_marks: Joi.number(),
  time_limit_sec: Joi.number(),
  max_attempts: Joi.number(),
  userType: Joi.string().valid("0", "1"),
});

const updateAssessmentSchema = Joi.object({
  title: Joi.string().trim().min(2).max(150),
  description: Joi.string().trim().allow(""),
  order: Joi.number().integer().min(0),
  exercise_type: Joi.string(),
  difficulty: Joi.string().valid("easy", "medium", "hard"),
  questions: Joi.array().items(questionSchema),
  shuffle_questions: Joi.boolean(),
  shuffle_options: Joi.boolean(),
  show_explanation: Joi.boolean(),
  total_marks: Joi.number(),
  time_limit_sec: Joi.number(),
  max_attempts: Joi.number(),
  userType: Joi.string().valid("0", "1"),
  is_active: Joi.boolean(),
});

module.exports = { createAssessmentSchema, updateAssessmentSchema };
