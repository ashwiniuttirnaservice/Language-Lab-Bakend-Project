const Joi = require("joi");

const objectId = Joi.string().hex().length(24);

const questionSchema = Joi.object({
  question_text: Joi.string().trim().min(1).required(),
  question_type: Joi.string().valid(
    "mcq",
    "fill_blank",
    "true_false",
    "short_answer",
    "match",
    "recorder",
    "spell_word",
  ),
  options: Joi.array().items(Joi.string().allow("")),
  match_pairs: Joi.array().items(
    Joi.object({ left: Joi.string().allow(""), right: Joi.string().allow("") }),
  ),
  correct_answer: Joi.string().trim().min(1).required(),
  explanation: Joi.string().allow("", null),
  marks: Joi.number().min(0).default(1),
  timestamp_sec: Joi.number().min(0),
});

const createTaskSchema = Joi.object({
  course_id: objectId.required(),
  topic_id: objectId,
  title: Joi.string().trim().min(2).max(200).required(),
  description: Joi.string().trim().allow("", null),
  instructions: Joi.string().trim().allow("", null),
  type: Joi.string().valid("audio", "video", "document", "link", "text").required(),
  // Required only for type === "link" / "text" — validated in the controller
  // since Joi conditionals here would need to run before file-based fields
  // (media_url) are known, which is only set from req.file after upload.
  link_url: Joi.string().uri().when("type", {
    is: "link",
    then: Joi.required(),
    otherwise: Joi.optional().allow("", null),
  }),
  text_content: Joi.string().trim().when("type", {
    is: "text",
    then: Joi.required(),
    otherwise: Joi.optional().allow("", null),
  }),
  // Kept optional (not `.when(...).required()`) because audio/video/document
  // tasks can arrive via either path: a direct multipart `taskMedia` file
  // (req.file) or, on update, the task's existing media_url round-tripped
  // unchanged by the frontend — the controller enforces that at least one of
  // the two is present for media types. Not `.uri()` — local files resolve
  // to a relative "/media/tasks/..." path (see taskController.js), not an
  // absolute URL, same as practicalValidation's answer_file_url.
  media_url: Joi.string().allow("", null),
  target: Joi.string().valid("all", "selected").default("all"),
  student_ids: Joi.alternatives().conditional("target", {
    is: "selected",
    then: Joi.array().items(objectId).min(1).required(),
    otherwise: Joi.optional(),
  }),
  due_date: Joi.date().iso(),
  status: Joi.string().valid("draft", "published", "closed").default("published"),
  // Sent as a JSON-stringified array over multipart (parsed by parseQuestions
  // middleware before this validator runs) — optional quiz checkpoints.
  questions: Joi.array().items(questionSchema),
});

const updateTaskSchema = Joi.object({
  course_id: objectId,
  topic_id: objectId,
  title: Joi.string().trim().min(2).max(200),
  description: Joi.string().trim().allow("", null),
  instructions: Joi.string().trim().allow("", null),
  type: Joi.string().valid("audio", "video", "document", "link", "text"),
  link_url: Joi.string().uri().allow("", null),
  text_content: Joi.string().trim().allow("", null),
  // See createTaskSchema's media_url comment — same dual-path (req.file or
  // existing URL round-tripped) applies to updates. Not `.uri()` — see there.
  media_url: Joi.string().allow("", null),
  target: Joi.string().valid("all", "selected"),
  student_ids: Joi.array().items(objectId),
  due_date: Joi.date().iso(),
  status: Joi.string().valid("draft", "published", "closed"),
  // Sent as a JSON-stringified array over multipart (parsed by parseQuestions
  // middleware before this validator runs) — optional quiz checkpoints.
  questions: Joi.array().items(questionSchema),
});

const updateSubmissionSchema = Joi.object({
  status: Joi.string().valid("pending", "submitted", "late", "reviewed"),
  grade: Joi.number().min(0),
  feedback: Joi.string().trim().allow("", null),
}).min(1);

const taskAnswerSchema = Joi.object({
  question_index: Joi.number().integer().min(0).required(),
  given_answer: Joi.string().allow("", null),
});

// A submission needs a file (validated in the controller from req.file) or
// submitted_text — never neither.
const submitTaskSchema = Joi.object({
  submitted_text: Joi.string().allow("", null),
  // Sent as a JSON-stringified array over multipart (parsed by parseAnswers
  // middleware) — answers to the task's optional quiz-checkpoint questions.
  answers: Joi.array().items(taskAnswerSchema),
});

// Same "department"/"batch" vocabulary as practicalValidation's
// assignPracticalSchema — segment = department, year = batch.
const assignTaskSchema = Joi.object({
  segment: Joi.string().trim().min(1).max(120).required(),
  year: Joi.number().integer().min(1).max(6).required(),
});

module.exports = {
  createTaskSchema,
  updateTaskSchema,
  updateSubmissionSchema,
  submitTaskSchema,
  assignTaskSchema,
};
