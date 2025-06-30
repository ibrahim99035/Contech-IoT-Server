const Joi = require('joi');

exports.deviceSchema = Joi.object({
  name: Joi.string().min(3).max(100).required(),
  type: Joi.string().valid('Light', 'Thermostat', 'Camera', 'Lock', 'Air conditioner', 'Fan', 'Garage').required(), 
  status: Joi.string().valid('on', 'off').default('off'),
  room: Joi.string().required(),
  users: Joi.array().items(Joi.string()),
  componentNumber: Joi.string().optional(),
  order: Joi.number().integer().min(1).max(6).required() 
});