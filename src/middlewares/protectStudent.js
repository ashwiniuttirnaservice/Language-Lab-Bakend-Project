const jwt = require("jsonwebtoken");

const Student = require("../models/Student");
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
