const mongoose = require("mongoose");
const { Schema, model } = mongoose;

const WordAnalysisSchema = new Schema(
  {
    expected: { type: String, required: true },
    spoken: { type: String, default: "" },
    status: {
      type: String,
      enum: ["correct", "missing", "mispronounced"],
      required: true,
    },
    confidence: { type: Number, default: 1.0 },
  },
  { _id: false },
);

const InteractiveSubmissionSchema = new Schema(
  {
    task_id: {
      type: Schema.Types.ObjectId,
      ref: "InteractiveTask",
      required: true,
      index: true,
    },
    student_id: {
      type: Schema.Types.ObjectId,
      ref: "Student",
      required: true,
      index: true,
    },
    institute_id: {
      type: Schema.Types.ObjectId,
      ref: "Institute",
      required: true,
      index: true,
    },

    // Overall metrics calculated by Vosk speech analyzer
    accuracy_score: {
      type: Number,
      required: true,
      min: 0,
      max: 100,
    },
    wpm: {
      type: Number,
      default: 0,
    },
    duration_seconds: {
      type: Number,
      default: 0,
    },

    // Number of attempts the student used before saving
    attempts_count: {
      type: Number,
      default: 1,
      min: 1,
      max: 5,
    },

    // Path to the recorded audio file stored locally
    audio_url: {
      type: String,
      default: null,
    },

    // Transcribed speech from Vosk
    transcribed_text: {
      type: String,
      default: "",
    },

    // Word-by-word diff analysis for visual highlighting (green/red/yellow)
    word_analysis: [WordAnalysisSchema],

    status: {
      type: String,
      enum: ["completed", "retrying", "reviewed"],
      default: "completed",
    },
  },
  { timestamps: true },
);

InteractiveSubmissionSchema.index(
  { task_id: 1, student_id: 1 },
  { unique: true },
);
InteractiveSubmissionSchema.index({ student_id: 1, status: 1 });
InteractiveSubmissionSchema.index({ institute_id: 1, createdAt: -1 });

module.exports = model("InteractiveSubmission", InteractiveSubmissionSchema);

