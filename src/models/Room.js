const mongoose = require('mongoose');
const crypto = require('crypto');
const { ROOM_TYPES } = require('../constants/roomTypes');
const bcrypt = require('bcryptjs');


const roomSchema = new mongoose.Schema({
  name: { type: String, required: true },
  type: { 
    type: String, 
    enum: ROOM_TYPES,
    default: 'other',
    required: true
  },
  creator: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  apartment: { type: mongoose.Schema.Types.ObjectId, ref: 'Apartment', required: true },
  devices: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Device' }],
  users: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }],
  roomPassword: { type: String }, 
  esp_component_connected: { type: Boolean, default: false },
  esp_id: { type: String }
}, { timestamps: true });

// Hash the roomPassword before saving if it's provided and modified
roomSchema.pre('save', async function (next) {
  if (!this.isModified('roomPassword') || !this.roomPassword) {
    return next();
  }
  try {
    const salt = await bcrypt.genSalt(10);
    this.roomPassword = await bcrypt.hash(this.roomPassword, salt);
    next();
  } catch (error) {
    next(error);
  }
});

// Assign esp_id before the insert. Doing this in post('save') left a window where
// the row was indexed with no esp_id, which collided with every other such room
// on the unique index.
roomSchema.pre('validate', function (next) {
  if (!this.esp_id) {
    const suffix = this.isNew
      ? crypto.randomBytes(12).toString('hex')
      : String(this._id);
    this.esp_id = `esp_${suffix}`;
  }
  next();
});

// Uniqueness only applies to rooms that actually have an esp_id, so that any
// number of not-yet-paired rooms can coexist.
roomSchema.index(
  { esp_id: 1 },
  { unique: true, partialFilterExpression: { esp_id: { $type: 'string' } } }
);

// Method to match entered password with hashed roomPassword
roomSchema.methods.matchRoomPassword = async function (enteredPassword) {
  return await bcrypt.compare(enteredPassword, this.roomPassword);
};

module.exports = mongoose.model('Room', roomSchema);