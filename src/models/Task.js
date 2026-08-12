const mongoose = require("mongoose");
const { Schema, model } = mongoose;

const questionSchema = new Schema(
  {
    question_text: { type: String, required: true },
    question_type: {
      type: String,
      enum: [
        "mcq",
        "fill_blank",
        "true_false",
        "short_answer",
        "match",
        "recorder",
        "spell_word",
      ],
    },
    options: [String],
    match_pairs: [
      {
        left: { type: String },
        right: { type: String },
        _id: false,
      },
    ],
    correct_answer: { type: String, required: true },
    explanation: { type: String },
    marks: { type: Number, default: 1 },
    timestamp_sec: { type: Number },
  },
  { _id: false },
);

const TaskSchema = new Schema(
  {
    institute_id: {
      type: Schema.Types.ObjectId,
      ref: "Institute",
      required: true,
    },
    // A task always belongs to exactly one course.
    course_id: { type: Schema.Types.ObjectId, ref: "Course", required: true },
    topic_id: { type: Schema.Types.ObjectId, ref: "Topic" },

    title: { type: String, required: true, trim: true },
    description: { type: String },
    instructions: { type: String },

    type: {
      type: String,
      enum: ["audio", "video", "document", "link", "text"],
      required: true,
    },
    // Only the field matching `type` is expected to be populated.
    media_url: { type: String }, // audio / video / document
    link_url: { type: String }, // link
    text_content: { type: String }, // text

    // Optional checkpoint-style quiz questions attached to the task (e.g.
    // questions timed to a point in an audio/video task via timestamp_sec).
    questions: [questionSchema],

    target: { type: String, enum: ["all", "selected"], default: "all" },
    // Only populated when target === "selected".
    student_ids: [{ type: Schema.Types.ObjectId, ref: "Student" }],

    // Department (Student.segment) + batch (Student.year) pairs this task
    // has been narrowed to — same vocabulary/shape as Practical's
    // assigned_batches. Layered ON TOP of target/student_ids rather than
    // replacing it: a student must satisfy the existing target rule AND
    // (if this array is non-empty) be in one of these department/batch
    // pairs. Empty means no extra restriction — fully backward compatible.
    assigned_batches: {
      type: [
        {
          segment: { type: String, required: true, trim: true },
          year: { type: Number, required: true, min: 1, max: 6 },
          _id: false,
        },
      ],
      default: [],
    },

    due_date: { type: Date },
    status: {
      type: String,
      enum: ["draft", "published", "closed"],
      default: "published",
    },

    created_by: {
      type: Schema.Types.ObjectId,
      ref: "Institute",
      required: true,
    },
    is_deleted: { type: Boolean, default: false },
  },
  { timestamps: true },
);

TaskSchema.index({ institute_id: 1, course_id: 1 });
TaskSchema.index({ institute_id: 1, status: 1 });

module.exports = model("Task", TaskSchema);
