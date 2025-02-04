const Joi = require('joi');

exports.apartmentSchema = Joi.object({
  name: Joi.string().min(3).max(100).required(),
  creator: Joi.string().required(),
  members: Joi.array().items(Joi.string()),
  rooms: Joi.array().items(Joi.string())
});