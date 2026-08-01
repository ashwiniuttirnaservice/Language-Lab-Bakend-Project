const multer = require("multer");
const path = require("path");
const fs = require("fs");

// ─────────────────────────────────────────────
// Field → Upload Folder Mapping
// Add new file fields here as the project grows.
// ─────────────────────────────────────────────
const getFolderPath = (fieldname) => {
  // Per-question practical submission files — one dynamic field per
  // question ("question_file_{questionId}"), so they can't be a fixed
  // switch case like the other named fields below.
  if (fieldname.startsWith("question_file_")) {
    return "uploads/practical-submissions";
  }

  switch (fieldname) {
    case "profileImage":
      return "uploads/super-admin";
    case "logo":
      return "uploads/institutes";
    case "profilePhoto":
      return "uploads/editors";
    case "studentPhoto":
      return "uploads/students";
    case "studentExcel":
      return "uploads/students/excel";
    case "practicalAttachment":
      return "uploads/practicals";
    case "practicalSubmissionAttachment":
      return "uploads/practical-submissions";
    case "taskMedia":
      return "uploads/tasks";
    case "taskSubmissionMedia":
      return "uploads/task-submissions";
    case "videoFile":
      return "uploads/modules/videos";
    case "audioFile":
      return "uploads/modules/audio";
    default:
      throw new Error(`Invalid file field: ${fieldname}`);
  }
};

// ─────────────────────────────────────────────
// Auto-create upload directory if it doesn't exist
// ─────────────────────────────────────────────
const ensureDirExists = (dirPath) => {
  if (!fs.existsSync(dirPath)) {
    fs.mkdirSync(dirPath, { recursive: true });
  }
};

// ─────────────────────────────────────────────
// Disk Storage Engine
// ─────────────────────────────────────────────
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    try {
      const folder = getFolderPath(file.fieldname);
      ensureDirExists(folder);
      cb(null, folder);
    } catch (err) {
      cb(new Error("Invalid file field: " + file.fieldname));
    }
  },
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + "_" + Math.round(Math.random() * 1e9);
    const ext = path.extname(file.originalname);
    cb(null, file.fieldname + "_" + uniqueSuffix + ext);
  },
});

// ─────────────────────────────────────────────
// Allowed MIME Types
// ─────────────────────────────────────────────
const allowedMimeTypes = [
  // Images
  "image/jpeg",
  "image/jpg",
  "image/png",
  "image/gif",
  "image/webp",
  "image/avif",
  "image/svg+xml",
  // Documents
  "application/pdf",
  "application/msword",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/vnd.ms-powerpoint",
  "application/vnd.openxmlformats-officedocument.presentationml.presentation",
  // Spreadsheets
  "application/vnd.ms-excel",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  // Text / Archives
  "text/plain",
  "application/zip",
  "application/x-zip-compressed",
  "application/x-rar-compressed",
  // Audio (language lab specific)
  "audio/mpeg",
  "audio/mp3",
  "audio/wav",
  "audio/ogg",
  "audio/webm",
  // Video
  "video/mp4",
  "video/quicktime",
  "video/x-msvideo",
  "video/x-matroska",
  "video/mpeg",
  "video/webm",
];

// ─────────────────────────────────────────────
// File Type Filter
// ─────────────────────────────────────────────
const fileFilter = (req, file, cb) => {
  if (allowedMimeTypes.includes(file.mimetype)) {
    cb(null, true);
  } else {
    cb(
      new Error(
        "File type not allowed. Accepted: images, documents, audio, video, zip, Excel.",
      ),
    );
  }
};

// ─────────────────────────────────────────────
// Multer Instance
// ─────────────────────────────────────────────
const upload = multer({
  storage,
  fileFilter,
  limits: {
    fileSize: 1024 * 1024 * 1024, // 1 GB
  },
});

module.exports = upload;
