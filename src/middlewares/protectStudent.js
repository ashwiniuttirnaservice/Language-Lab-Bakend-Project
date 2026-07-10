const jwt = require("jsonwebtoken");

const Student = require("../models/Student");
const Session = require("../models/Session");
const { sendError } = require("../utils/apiResponse");

const protectStudent = async (req, res, next) => {
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

    if (decoded.role !== "student") {
      return sendError(res, 403, false, "Access denied. Not a student token.");
    }

    // ── Session validity check ─────────────────────────────────────────────────
    // Verify the session still exists in DB, is active, and has not expired.
    // This ensures that after logout (session.is_active = false) the token is
    // properly rejected even if the JWT itself hasn't expired yet.
    if (decoded.session_id) {
      const session = await Session.findById(decoded.session_id).lean();

      if (!session) {
        return sendError(res, 401, false, "Session not found. Please log in again.");
      }

      if (!session.is_active) {
        return sendError(res, 401, false, "Session expired. Please log in again.");
      }

      if (session.expires_at && new Date(session.expires_at) < new Date()) {
        // Mark as inactive to keep DB consistent
        await Session.findByIdAndUpdate(decoded.session_id, { is_active: false });
        return sendError(res, 401, false, "Session has expired. Please log in again.");
      }
    }
    // ──────────────────────────────────────────────────────────────────────────

    const student = await Student.findById(decoded.id).select("-password");

    if (!student) {
      return sendError(res, 401, false, "Student not found.");
    }

    if (!student.is_active) {
      return sendError(res, 403, false, "Account is inactive.");
    }

    req.student = student;
    req.session_id = decoded.session_id || null;

    next();
  } catch (error) {
    return sendError(res, 401, false, "Invalid or expired token.", null, error.message);
  }
};

module.exports = protectStudent;
