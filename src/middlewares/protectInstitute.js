const jwt = require("jsonwebtoken");

const Institute = require("../models/Institute");
const { sendError } = require("../utils/apiResponse");

const protectInstitute = async (req, res, next) => {
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

    if (decoded.role !== "institute") {
      return sendError(res, 403, false, "Access denied. Not an institute token.");
    }

    const institute = await Institute.findById(decoded.id).select("-password");

    if (!institute) {
      return sendError(res, 401, false, "Institute not found.");
    }

    if (!institute.is_active) {
      return sendError(res, 403, false, "Institute account is inactive.");
    }

    const instituteObj = institute.toObject();
    instituteObj.role = "institute";
    req.institute = instituteObj;

    next();
  } catch (error) {
    return sendError(res, 401, false, "Invalid or expired token.", null, error.message);
  }
};

module.exports = protectInstitute;
