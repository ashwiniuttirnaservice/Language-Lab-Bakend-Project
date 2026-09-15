const jwt = require("jsonwebtoken");

const SuperAdmin = require("../models/SuperAdmin");
const Institute = require("../models/Institute");
const Editor = require("../models/Editor");
const Student = require("../models/Student");

const MODEL_MAP = {
  super_admin: { model: SuperAdmin, key: "admin" },
  institute: { model: Institute, key: "institute" },
  editor: { model: Editor, key: "editor" },
  student: { model: Student, key: "student" },
};

// Like protectUser, but never blocks the request — if there's no token, or
// it's invalid/expired, or the account no longer exists, this just calls
// next() with req[role] left unset instead of erroring. For routes that stay
// open to anonymous/admin-panel callers but still want to know "is this
// caller a logged-in student?" to adjust what they return (see
// assessmentController.getAll filtering by userType for students only).
const optionalAuth = async (req, res, next) => {
  try {
    const header = req.headers.authorization;
    if (!header || !header.startsWith("Bearer ")) return next();

    const token = header.split(" ")[1];
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    const entry = MODEL_MAP[decoded.role];
    if (!entry) return next();

    const user = await entry.model.findById(decoded.id).select("-password");
    if (!user || user.is_active === false) return next();

    req[entry.key] = user;
    next();
  } catch {
    next();
  }
};

module.exports = optionalAuth;
