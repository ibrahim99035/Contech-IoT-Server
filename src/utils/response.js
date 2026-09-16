/**
 * Standardized API Response Helpers
 * Ensures consistent response shapes across all endpoints.
 * @module utils/response
 */

/**
 * Send a success response
 * @param {Object} res - Express response object
 * @param {*} data - Response payload
 * @param {string} message - Human-readable message
 * @param {number} statusCode - HTTP status code (default: 200)
 */
exports.success = (res, data = null, message = 'Success', statusCode = 200) => {
  const response = { success: true, message };
  if (data !== null && data !== undefined) {
    response.data = data;
  }
  return res.status(statusCode).json(response);
};

/**
 * Send an error response
 * @param {Object} res - Express response object
 * @param {string} message - Human-readable error message
 * @param {number} statusCode - HTTP status code (default: 500)
 * @param {string} code - Machine-readable error code
 */
exports.error = (res, message = 'Internal server error', statusCode = 500, code = 'SERVER_ERROR') => {
  return res.status(statusCode).json({
    success: false,
    message,
    code
  });
};

/**
 * Send a validation error response
 * @param {Object} res - Express response object
 * @param {string|string[]} errors - Validation error(s)
 */
exports.validationError = (res, errors) => {
  return res.status(400).json({
    success: false,
    message: 'Validation error',
    code: 'VALIDATION_ERROR',
    errors: Array.isArray(errors) ? errors : [errors]
  });
};
