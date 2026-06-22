const jwt = require("jsonwebtoken");

const SuperAdmin = require("../models/SuperAdmin");

const { sendError } = require("../utils/apiResponse");

const protectSuperAdmin = async (req, res, next) => {
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

    const admin = await SuperAdmin.findById(decoded.id).select("-password");

    if (!admin) {
      return sendError(res, 401, false, "Super Admin not found.");
    }

    if (!admin.is_active) {
      return sendError(res, 403, false, "Account is inactive.");
    }

    req.admin = admin;

    next();
  } catch (error) {
    return sendError(
      res,
      401,
      false,
      "Invalid or expired token.",
      null,
      error.message,
    );
  }
};

module.exports = protectSuperAdmin;
