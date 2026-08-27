/**
 * 404 Not Found Middleware
 * Catches requests to unmapped routes and forwards a structured error.
 * @module middleware/notFound
 */

const notFound = (req, res, next) => {
  res.status(404).json({
    success: false,
    message: `Not Found - ${req.originalUrl}`,
    code: 'NOT_FOUND'
  });
};

module.exports = { notFound };