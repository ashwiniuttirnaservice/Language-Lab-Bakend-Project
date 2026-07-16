const Joi = require("joi");

const objectId = Joi.string().hex().length(24);

const baseModuleSchema = {
  topic_id: objectId.required(),
  sub_topic_id: objectId.required(),
  title: Joi.string().trim().min(2).max(200).required(),
  description: Joi.string().trim().max(500),
  order: Joi.number().integer().min(0),
  total_marks: Joi.number().min(0),
  time_limit_sec: Joi.number().integer().min(0),
  max_attempts: Joi.number().integer().min(1),
};

const questionTypeSchema = Joi.object({
  question_text: Joi.string().required(),
  question_type: Joi.string().valid(
    "mcq",
    "fill_blank",
    "true_false",
    "short_answer",
    "match",
    "recorder",
    "spell_word",
  ),
  options: Joi.array().items(Joi.string()),
  match_pairs: Joi.array().items(Joi.object({
    left: Joi.string(),
    right: Joi.string(),
  })),
  correct_answer: Joi.string().required(),
  explanation: Joi.string(),
  marks: Joi.number(),
});

const createVideoModuleSchema = Joi.object({
  ...baseModuleSchema,
  // video object sent as JSON string in multipart form
  questions: Joi.array().items(questionTypeSchema.keys({
    timestamp_sec: Joi.number(),
  })),
});

const createAudioModuleSchema = Joi.object({
  ...baseModuleSchema,
  allow_replay: Joi.boolean(),
  replay_limit: Joi.number().integer().min(0),
  questions: Joi.array().items(questionTypeSchema.keys({
    timestamp_sec: Joi.number(),
  })),
});

const createTextModuleSchema = Joi.object({
  ...baseModuleSchema,
  content: Joi.object({
    body: Joi.string().required(),
    word_count: Joi.number().integer(),
    read_time_min: Joi.number(),
    level: Joi.string(),
    source: Joi.string(),
  }).required(),
  questions: Joi.array().items(questionTypeSchema.keys({
    paragraph_ref: Joi.number().integer(),
  })),
});

const createExerciseModuleSchema = Joi.object({
  ...baseModuleSchema,
  content_module_id: objectId,
  exercise_type: Joi.string()
    .valid("mcq", "fill_blank", "true_false", "short_answer", "match", "recorder", "spell_word")
    .required(),
  difficulty: Joi.string().valid("easy", "medium", "hard"),
  shuffle_questions: Joi.boolean(),
  shuffle_options: Joi.boolean(),
  show_explanation: Joi.boolean(),
  questions: Joi.array().items(questionTypeSchema.keys({
    hint: Joi.string(),
    negative_marks: Joi.number(),
  })).min(1).required(),
});

const createVocabularyModuleSchema = Joi.object({
  ...baseModuleSchema,
  words: Joi.array().items(Joi.object({
    word: Joi.string().required(),
    pronunciation: Joi.string(),
    part_of_speech: Joi.string().valid("noun", "verb", "adjective", "adverb", "phrase"),
    meaning: Joi.string().required(),
    example: Joi.string(),
    synonyms: Joi.array().items(Joi.string()),
    antonyms: Joi.array().items(Joi.string()),
    difficulty: Joi.string().valid("easy", "medium", "hard"),
  })).min(1).required(),
  questions: Joi.array().items(Joi.object({
    question_text: Joi.string().required(),
    question_type: Joi.string().valid("mcq", "fill_blank", "match_meaning", "spell_word"),
    word_ref: Joi.string(),
    options: Joi.array().items(Joi.string()),
    correct_answer: Joi.string().required(),
    marks: Joi.number(),
  })),
});

const SCHEMA_MAP = {
  video: createVideoModuleSchema,
  audio: createAudioModuleSchema,
  text: createTextModuleSchema,
  exercise: createExerciseModuleSchema,
  vocabulary: createVocabularyModuleSchema,
};

module.exports = {
  createVideoModuleSchema,
  createAudioModuleSchema,
  createTextModuleSchema,
  createExerciseModuleSchema,
  createVocabularyModuleSchema,
  SCHEMA_MAP,
};
