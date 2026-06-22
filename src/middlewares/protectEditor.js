const jwt = require("jsonwebtoken");

const Editor = require("../models/Editor");
const { sendError } = require("../utils/apiResponse");

const protectEditor = async (req, res, next) => {
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

    const editor = await Editor.findById(decoded.id).select("-password");

    if (!editor) {
      return sendError(res, 401, false, "Editor not found.");
    }

    if (!editor.is_active) {
      return sendError(res, 403, false, "Account is inactive.");
    }

    req.editor = editor;

    next();
  } catch (error) {
    return sendError(res, 401, false, "Invalid or expired token.", null, error.message);
  }
};

module.exports = protectEditor;
