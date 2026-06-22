const { sendError } = require("../utils/apiResponse");

const authorizeRoles = (...roles) => {
  return (req, res, next) => {
    const currentUser = req.admin || req.institute || req.editor || req.student;

    if (!currentUser) {
      return sendError(res, 401, false, "Unauthorized access.");
    }

    if (!roles.includes(currentUser.role)) {
      return sendError(
        res,
        403,
        false,
        `Access denied. Role '${currentUser.role}' is not authorized to perform this action.`,
      );
    }

    next();
  };
};

module.exports = authorizeRoles;
