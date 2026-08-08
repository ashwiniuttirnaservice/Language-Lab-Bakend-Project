const express = require("express");
const dotenv = require("dotenv");
const cors = require("cors");
const helmet = require("helmet");
const morgan = require("morgan");
const fs = require("fs");
const path = require("path");
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

app.get("/", (req, res) => res.json({ message: "Language Lab API Running" }));

// Serves locally-cached course videos (see instituteController.downloadCourseData
// + service/videoDownloadService.js) so playback can happen from this
// institute's own machine instead of streaming from AWS every time.
//
// helmet()'s default Cross-Origin-Resource-Policy: same-origin blocks a
// <video>/<img> tag from loading this at all when the frontend runs on a
// different origin (e.g. Next dev on :3000 fetching from the API on :5000)
// — browsers enforce CORP independently of the Access-Control-Allow-Origin
// CORS header, and curl/Postman never enforce it, so this fails silently
// only in an actual browser <video> tag ("This video failed to load.").
// Loosen it to cross-origin for just this static route.
const serveDownloadedMedia = (req, res, next) => {
  res.setHeader("Cross-Origin-Resource-Policy", "cross-origin");
  next();
};
const downloadedMediaDir = express.static(path.join(__dirname, "uploads", "downloaded"));

app.use("/media", serveDownloadedMedia, downloadedMediaDir);

// Same files, also mounted under /api/media — some deployments (nginx etc.)
// sit behind a reverse proxy that only forwards paths starting with /api, so
// a bare "/media/..." URL never reaches this server in that setup (404s at
// the proxy itself, not from here). utils/media.js's getMediaBaseUrl() builds
// local_url URLs by appending straight onto NEXT_PUBLIC_API_URL (which
// already ends in /api), so this is the route that actually gets hit.
app.use("/api/media", serveDownloadedMedia, downloadedMediaDir);

app.use("/api", require("./src/index"));

app.use(require("./src/middlewares/errorHandler"));

const PORT = process.env.PORT || 5000;
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
