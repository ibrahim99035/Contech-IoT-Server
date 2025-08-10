const Joi = require('joi');

const ROOM_TYPES = [
  'living_room',
  'bedroom', 
  'kitchen',
  'bathroom',
  'dining_room',
  'office',
  'garage',
  'other'
];

const roomSchema = Joi.object({
  name: Joi.string().min(3).max(100).required(),
  type: Joi.string().valid(...ROOM_TYPES).default('other'),
  apartment: Joi.string().required(),
  devices: Joi.array().items(Joi.string()),
  users: Joi.array().items(Joi.string()),
  roomPassword: Joi.string().required(),
  esp_id: Joi.string().required()
});

module.exports = { roomSchema, ROOM_TYPES };