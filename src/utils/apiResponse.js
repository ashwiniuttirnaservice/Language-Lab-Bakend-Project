/**
 * Send a successful JSON response.
 *
 * @param {import('express').Response} _res
 * @param {number}  _statusCode  - HTTP status code (default 200)
 * @param {boolean} _success     - Always true for success responses
 * @param {string}  _message     - Human-readable message
 * @param {*}       _data        - Response payload
 * @param {*}       _error       - Error detail (null for success)
 */
const sendResponse = (
  _res,
  _statusCode = 200,
  _success = true,
  _message = "",
  _data = null,
  _error = null,
) => {
  _statusCode = Number(_statusCode);

  return _res.status(_statusCode).json({
    statusCode: _statusCode,
    success: _success,
    message: _message,
    data: _data,
    error: _error,
  });
};

/**
 * Send an error JSON response.
 *
 * @param {import('express').Response} _res
 * @param {number}  _statusCode  - HTTP status code (default 500)
 * @param {boolean} _success     - Always false for error responses
 * @param {string}  _message     - Human-readable error message
 * @param {*}       _data        - Optional data (null for errors)
 * @param {*}       _error       - Error detail / validation errors
 */
const sendError = (
  _res,
  _statusCode = 500,
  _success = false,
  _message = "",
  _data = null,
  _error = null,
) => {
  _statusCode = Number(_statusCode);

  return _res.status(_statusCode).json({
    statusCode: _statusCode,
    success: _success,
    message: _message,
    data: _data,
    error: _error,
  });
};

module.exports = { sendResponse, sendError };
