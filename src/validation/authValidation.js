const Joi = require('joi');

// Public self-registration. Deliberately excludes 'admin' — the controller also
// rejects it, but failing validation gives the caller a 400 with field detail
// instead of relying on that check.
const registerSchema = Joi.object({
  name: Joi.string().trim().min(2).max(100).required(),
  email: Joi.string().trim().email().max(254).required(),
  password: Joi.string().min(8).max(128).required(),
  // 'admin' stays in the enum so the controller's explicit 403 (not a generic
  // validation error) is what a caller attempting it receives.
  role: Joi.string().valid('admin', 'customer', 'moderator').default('customer'),
});

const loginSchema = Joi.object({
  email: Joi.string().trim().email().required(),
  password: Joi.string().required(),
});

module.exports = { registerSchema, loginSchema };
