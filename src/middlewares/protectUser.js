const jwt = require("jsonwebtoken");

const SuperAdmin = require("../models/SuperAdmin");
const Institute = require("../models/Institute");
const Editor = require("../models/Editor");
const Student = require("../models/Student");
const { sendError } = require("../utils/apiResponse");

const MODEL_MAP = {
  super_admin: { model: SuperAdmin, key: "admin" },
  institute: { model: Institute, key: "institute" },
  editor: { model: Editor, key: "editor" },
  student: { model: Student, key: "student" },
};

// Accepts any valid JWT regardless of role — sets req[role] for authorizeRoles to pick up
const protectUser = async (req, res, next) => {
  try {
    let token;

    if (
      req.headers.authorization &&
      req.headers.authorization.startsWith("Bearer ")
    ) {
      token = req.headers.authorization.split(" ")[1];
    }

    if (!token) {
      return sendError(res, 401, false, "Not authorized. No token provided.");
    }

    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    const entry = MODEL_MAP[decoded.role];

    if (!entry) {
      return sendError(res, 403, false, "Unknown role in token.");
    }

    const user = await entry.model.findById(decoded.id).select("-password");

    if (!user) {
      return sendError(res, 401, false, "User not found.");
    }

    if (user.is_active === false) {
      return sendError(res, 403, false, "Account is inactive.");
    }

    req[entry.key] = user;
    if (decoded.session_id) req.session_id = decoded.session_id;

    next();
  } catch (error) {
    return sendError(res, 401, false, "Invalid or expired token.", null, error.message);
  }
};

module.exports = protectUser;
