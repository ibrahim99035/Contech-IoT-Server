const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');

// Simple room types
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

// Method to match entered password with hashed roomPassword
roomSchema.methods.matchRoomPassword = async function (enteredPassword) {
  return await bcrypt.compare(enteredPassword, this.roomPassword);
};

module.exports = mongoose.model('Room', roomSchema);