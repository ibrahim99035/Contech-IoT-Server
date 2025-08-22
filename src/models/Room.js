const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');

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
  esp_id: { type: String, unique: true }
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

// Set esp_id after the document is saved
roomSchema.post('save', async function (doc, next) {
  if (!doc.esp_id) {
    await this.constructor.findByIdAndUpdate(doc._id, {
      esp_id: `esp_${doc._id}`
    });
  }
  next();
});

// Method to match entered password with hashed roomPassword
roomSchema.methods.matchRoomPassword = async function (enteredPassword) {
  return await bcrypt.compare(enteredPassword, this.roomPassword);
};

module.exports = mongoose.model('Room', roomSchema);