const multer = require("multer");
const { sendError } = require("../utils/apiResponse");

// Catches errors that occur before a controller runs (multer file
// validation/size limits, malformed JSON bodies, etc.) — these are thrown
// via next(err) and never reach asyncHandler, so without this they fall
// through to Express's default HTML error page instead of the API's JSON
// response envelope.
// eslint-disable-next-line no-unused-vars
const errorHandler = (err, req, res, next) => {
  if (err instanceof multer.MulterError) {
    if (err.code === "LIMIT_FILE_SIZE") {
      return sendError(res, 400, false, "File is too large. Maximum allowed size is 1 GB.");
    }
    return sendError(res, 400, false, err.message);
  }

  if (err) {
    return sendError(res, err.statusCode || 400, false, err.message || "Invalid request.");
  }

  return sendError(res, 500, false, "Internal Server Error");
};

module.exports = errorHandler;
