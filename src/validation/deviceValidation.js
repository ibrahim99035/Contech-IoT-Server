const Joi = require('joi');

exports.deviceSchema = Joi.object({
  name: Joi.string().min(3).max(100).required(),
  type: Joi.string().valid('Light', 'Thermostat', 'Camera', 'Lock').required(),
  status: Joi.string().valid('on', 'off').default('off'),
  room: Joi.string().required(),
  users: Joi.array().items(Joi.string())
});