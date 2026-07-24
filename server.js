const express = require("express");
const dotenv = require("dotenv");
const cors = require("cors");
const helmet = require("helmet");
const morgan = require("morgan");
const fs = require("fs");
const path = require("path");
const connectDB = require("./src/config/db");

dotenv.config();
dotenv.config({ path: ".env.local" }); // institute-side vars (e.g. INSTITUTE_MONGO_URI)
connectDB();

const registerJobs = require("./src/jobs/sessionCleanup");
registerJobs();

const app = express();

const logsDir = path.join(__dirname, "logs");
if (!fs.existsSync(logsDir)) {
  fs.mkdirSync(logsDir, { recursive: true });
}

const accessLogStream = fs.createWriteStream(
  path.join(logsDir, "access.log"),
  { flags: "a" },
);

app.use(express.json());
app.use(cors());
app.use(helmet());
app.use(morgan("combined", { stream: accessLogStream }));
if (process.env.NODE_ENV !== "production") {
  app.use(morgan("dev"));
}

app.get("/", (req, res) => res.json({ message: "Language Lab API Running" }));

app.use("/api", require("./src/index"));

app.use(require("./src/middlewares/errorHandler"));

const PORT = process.env.PORT || 5000;
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
