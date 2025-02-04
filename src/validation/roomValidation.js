const Joi = require('joi');

const roomSchema = Joi.object({
  name: Joi.string().min(3).max(100).required(),
  apartment: Joi.string().required(),
  devices: Joi.array().items(Joi.string()),
  users: Joi.array().items(Joi.string())
});

module.exports = { roomSchema };