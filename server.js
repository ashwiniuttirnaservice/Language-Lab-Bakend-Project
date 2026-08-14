const express = require("express");
const dotenv = require("dotenv");
const cors = require("cors");
const helmet = require("helmet");
const morgan = require("morgan");
const fs = require("fs");
const path = require("path");
const multer = require("multer");
const connectDB = require("./src/config/db");

dotenv.config();
connectDB();

const registerJobs = require("./src/jobs/sessionCleanup");
registerJobs();

const app = express();

const logsDir = path.join(__dirname, "logs");
if (!fs.existsSync(logsDir)) {
  fs.mkdirSync(logsDir, { recursive: true });
}

const accessLogStream = fs.createWriteStream(path.join(logsDir, "access.log"), {
  flags: "a",
});

app.use(express.json());
app.use(cors());
app.use(helmet());
app.use(morgan("combined", { stream: accessLogStream }));
if (process.env.NODE_ENV !== "production") {
  app.use(morgan("dev"));
}

app.get("/", (req, res) =>
  res.json({ message: "Language Lab API Running......" }),
);

const serveDownloadedMedia = (req, res, next) => {
  res.setHeader("Cross-Origin-Resource-Policy", "cross-origin");
  next();
};
const downloadedMediaDir = express.static(
  path.join(__dirname, "uploads", "downloaded"),
);

app.use("/media", serveDownloadedMedia, downloadedMediaDir);

const uploadsDir = path.join(__dirname, "uploads");
if (!fs.existsSync(uploadsDir)) {
  fs.mkdirSync(uploadsDir, { recursive: true });
}
app.use("/uploads", serveDownloadedMedia, express.static(uploadsDir));
app.use("/api/uploads", serveDownloadedMedia, express.static(uploadsDir));
app.use("/api/media", serveDownloadedMedia, downloadedMediaDir);

// Student practical-manual submissions (per-question answer files + the
// whole-manual PDF) are kept on this server's own disk instead of AWS — see
// practicalController.submitMine — so they need the same static serving +
// cross-origin exemption as the downloaded-media route above.
const practicalSubmissionsDir = express.static(
  path.join(__dirname, "uploads", "practical-submissions"),
);
app.use("/media/practical-submissions", serveDownloadedMedia, practicalSubmissionsDir);
app.use("/api/media/practical-submissions", serveDownloadedMedia, practicalSubmissionsDir);

// Student-task media (institute's audio/video/document upload + a student's
// submitted file) — same local-disk treatment as practical submissions above,
// replacing the old chunked-upload-to-AWS flow (see taskController.js).
const taskMediaDir = express.static(path.join(__dirname, "uploads", "tasks"));
app.use("/media/tasks", serveDownloadedMedia, taskMediaDir);
app.use("/api/media/tasks", serveDownloadedMedia, taskMediaDir);

const taskSubmissionsDir = express.static(
  path.join(__dirname, "uploads", "task-submissions"),
);
app.use("/media/task-submissions", serveDownloadedMedia, taskSubmissionsDir);
app.use("/api/media/task-submissions", serveDownloadedMedia, taskSubmissionsDir);

app.use("/api", require("./src/index"));

app.use(require("./src/middlewares/errorHandler"));

const PORT = process.env.PORT || 5000;
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));