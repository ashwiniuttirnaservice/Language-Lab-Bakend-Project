const asyncHandler = (fn) => {
  return async (req, res, next = () => {}) => {
    try {
      await fn(req, res, next);
    } catch (err) {
      return res.status(500).json({
        success: false,
        message: err?.message || "Internal Server Error",
        data: null,
      });
    }
  };
};

module.exports = asyncHandler;
