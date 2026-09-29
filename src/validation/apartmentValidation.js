const Joi = require('joi');

exports.apartmentSchema = Joi.object({
  name: Joi.string().min(3).max(100).required(),
  // Derived from the auth token by the controller, never accepted from a body.
  creator: Joi.string(),
  members: Joi.array().items(Joi.string()),
  rooms: Joi.array().items(Joi.string())
});