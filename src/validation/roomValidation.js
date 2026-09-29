const { ROOM_TYPES } = require('../constants/roomTypes');

const Joi = require('joi');


const roomSchema = Joi.object({
  name: Joi.string().min(3).max(100).required(),
  type: Joi.string().valid(...ROOM_TYPES).default('other'),
  apartment: Joi.string().required(),
  devices: Joi.array().items(Joi.string()),
  users: Joi.array().items(Joi.string()),
  // Optional: a room can be created without protection and one set later via
  // the dedicated password endpoint. The Mongoose model does not require it
  // either, and the client omits the field when the user leaves it blank —
  // requiring it here made every such create fail with a 400.
  roomPassword: Joi.string().allow('').optional()
});

module.exports = { roomSchema, ROOM_TYPES };