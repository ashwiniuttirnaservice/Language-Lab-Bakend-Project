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

// ==========================================
// LOCAL UPLOAD API ENDPOINT (For Offline Use)
// ==========================================
const upload = multer({ storage: multer.memoryStorage() });

app.post("/api/upload/local", upload.single("file"), (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ success: false, message: "No file uploaded" });
    }

    const localUploadDir = path.join(__dirname, "uploads", "local");
    if (!fs.existsSync(localUploadDir)) {
      fs.mkdirSync(localUploadDir, { recursive: true });
    }

    const fileName = `${Date.now()}_${req.file.originalname}`;
    const filePath = path.join(localUploadDir, fileName);
    fs.writeFileSync(filePath, req.file.buffer);

    const baseUrl = `${req.protocol}://${req.get("host")}`;

    res.json({
      success: true,
      fileUrl: `${baseUrl}/api/uploads/local/${fileName}`,
    });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

app.use("/api", require("./src/index"));

app.use(require("./src/middlewares/errorHandler"));

const PORT = process.env.PORT || 5000;
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));