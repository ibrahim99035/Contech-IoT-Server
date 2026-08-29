/**
 * Request body validation middleware using Joi schemas.
 * @module middleware/validate
 */

const { validationError } = require('../utils/response');

/**
 * Validate req.body against a Joi schema.
 * On failure returns 400 with a standardized error shape and stops the chain.
 * @param {import('joi').Schema} schema
 */
function validate(schema) {
  return (req, res, next) => {
    const { error, value } = schema.validate(req.body, { abortEarly: false });
    if (error) {
      return validationError(res, error.details.map((d) => d.message));
    }
    // Use the sanitized/coerced value going forward
    req.body = value;
    return next();
  };
}

module.exports = { validate };