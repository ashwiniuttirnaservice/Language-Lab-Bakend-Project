const Joi = require("joi");

const objectId = Joi.string().hex().length(24);

const logActivitySchema = Joi.object({
  topic_id: objectId.required(),
  sub_topic_id: objectId.required(),
  module_id: objectId,
  module_type: Joi.string().valid("audio", "video", "text", "exercise", "vocabulary").required(),
  activity_type: Joi.string().valid(
    "video_play", "video_pause", "video_forward", "video_backward", "video_complete",
    "audio_play", "audio_pause", "audio_replay", "audio_complete",
    "text_start", "text_complete",
    "exercise_start", "exercise_submit", "exercise_complete", "exercise_skip",
    "vocabulary_start", "vocabulary_submit", "vocabulary_complete", "vocabulary_skip",
    "attendance_marked", "ai_query",
  ).required(),
  progress_percent: Joi.number().min(0).max(100),
  timestamp_in_media: Joi.number().min(0),
  time_spent_sec: Joi.number().min(0),
  score: Joi.number().min(0),
  max_score: Joi.number().min(0),
  accuracy: Joi.number().min(0).max(100),
});

const askAiSchema = Joi.object({
  question: Joi.string().trim().min(3).max(500).required(),
  sub_topic_id: objectId.required(),
  module_type: Joi.string().valid("audio", "video", "text", "exercise", "vocabulary").required(),
  module_id: objectId,
});

module.exports = { logActivitySchema, askAiSchema };
