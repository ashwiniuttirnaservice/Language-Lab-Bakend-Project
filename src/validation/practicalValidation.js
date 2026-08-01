const Joi = require("joi");

const objectId = Joi.string().hex().length(24);

const questionSchema = Joi.object({
  question_text: Joi.string().trim().min(1).required(),
  answer_key_html: Joi.string().trim().allow("", null),
  answer_lines: Joi.number().integer().min(1).max(50).default(5),
  solution_type: Joi.string().valid("text", "file").default("text"),
});

const createPracticalSchema = Joi.object({
  course_id: objectId.required(),
  topic_id: objectId,
  title: Joi.string().trim().min(2).max(200).required(),
  // Sent as a JSON string over multipart (parsed by parseQuestions middleware
  // before this validator runs) — one entry per numbered question.
  questions: Joi.array().items(questionSchema).min(1).required(),
});

const updatePracticalSchema = Joi.object({
  course_id: objectId,
  topic_id: objectId,
  title: Joi.string().trim().min(2).max(200),
  questions: Joi.array().items(questionSchema).min(1),
  // Lets the client drop an existing attachment without uploading a new one.
  remove_attachment: Joi.boolean(),
});

const answerSchema = Joi.object({
  question_id: objectId.required(),
  answer_html: Joi.string().allow("", null),
  // Present when the question resubmits without re-uploading — keeps the
  // previously uploaded file rather than clearing it. A newly uploaded file
  // for this question arrives separately over multipart (see submitMine).
  answer_file_url: Joi.string().allow("", null),
});

// Sent as a JSON string over multipart (parsed by parseAnswers middleware).
// "text" solutions require the per-question answers array; "file" solutions
// are covered by the multipart attachment instead (checked in the controller,
// since the file itself never reaches Joi).
const submitPracticalSchema = Joi.object({
  solution_type: Joi.string().valid("text", "file").default("text"),
  answers: Joi.array()
    .items(answerSchema)
    .when("solution_type", {
      is: "file",
      then: Joi.array().optional(),
      otherwise: Joi.array().min(1).required(),
    }),
});

const gradeSubmissionSchema = Joi.object({
  marks: Joi.number().min(0),
  feedback: Joi.string().trim().allow("", null),
}).min(1);

module.exports = {
  createPracticalSchema,
  updatePracticalSchema,
  submitPracticalSchema,
  gradeSubmissionSchema,
};
