const mongoose = require("mongoose");
const { Schema, model } = mongoose;

const VocabularyModuleSchema = new Schema(
  {
    topic_id: { type: Schema.Types.ObjectId, ref: "Topic", required: true },
    sub_topic_id: { type: Schema.Types.ObjectId, ref: "SubTopic", required: true },
    title: { type: String, required: true, trim: true },
    description: { type: String },
    order: { type: Number, default: 0 },
    module_type: { type: String, default: "vocabulary", immutable: true },

    words: [
      {
        word: { type: String, required: true },
        pronunciation: { type: String },
        part_of_speech: {
          type: String,
          enum: ["noun", "verb", "adjective", "adverb", "phrase"],
        },
        meaning: { type: String, required: true },
        example: { type: String },
        audio_url: { type: String },
        image_url: { type: String },
        synonyms: [String],
        antonyms: [String],
        difficulty: { type: String, enum: ["easy", "medium", "hard"], default: "easy" },
        _id: false,
      },
    ],

    questions: [
      {
        question_text: { type: String, required: true },
        question_type: {
          type: String,
          enum: ["mcq", "fill_blank", "match_meaning", "spell_word"],
        },
        word_ref: { type: String },
        options: [String],
        correct_answer: { type: String, required: true },
        explanation: { type: String },
        marks: { type: Number, default: 1 },
        _id: false,
      },
    ],

    total_marks: { type: Number, default: 0 },
    time_limit_sec: { type: Number },
    max_attempts: { type: Number, default: 5 },

    created_by: { type: Schema.Types.ObjectId, ref: "Editor", required: true },
    is_active: { type: Boolean, default: true },
  },
  { timestamps: true },
);

VocabularyModuleSchema.index({ topic_id: 1, sub_topic_id: 1 });
VocabularyModuleSchema.index({ created_by: 1 });

module.exports = model("VocabularyModule", VocabularyModuleSchema);
