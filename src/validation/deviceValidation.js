const Joi = require('joi');

exports.deviceSchema = Joi.object({
  name: Joi.string().min(3).max(100).required(),
  type: Joi.string().valid('Light', 'Thermostat', 'Camera', 'Lock', 'Air conditioner', 'Fan', 'Garage', 'Curtain').required(), 
  status: Joi.string().valid('on', 'off', 'locked', 'unlocked').default('off'),
  room: Joi.string().required(),
  users: Joi.array().items(Joi.string()),
  componentNumber: Joi.string().optional(),
  order: Joi.number().integer().min(1).max(6).required(),
  
  // Google Assistant Integration Fields
  active: Joi.boolean().default(true),
  brightness: Joi.number().min(0).max(100).optional(),
  color: Joi.object({
    spectrumRgb: Joi.number().optional(),
    temperatureK: Joi.number().optional()
  }).optional(),
  nicknames: Joi.array().items(Joi.string()).optional(),
  capabilities: Joi.object({
    brightness: Joi.boolean().default(false),
    color: Joi.boolean().default(false)
  }).optional(),
  
  // Thermostat specific fields
  thermostatMode: Joi.string().valid('heat', 'cool', 'auto', 'off').optional(),
  targetTemperature: Joi.number().optional(),
  currentTemperature: Joi.number().optional(),
  
  // Lock specific fields
  lockState: Joi.string().valid('locked', 'unlocked').optional()
});