const mongoose = require('mongoose');
const crypto = require('crypto');

const deviceSchema = new mongoose.Schema({
  name: { type: String, required: true },
  type: { type: String, required: true }, // E.g., Light, Thermostat, etc.
  status: { type: String, enum: ['on', 'off', 'locked', 'unlocked'], default: 'off' },
  room: { type: mongoose.Schema.Types.ObjectId, ref: 'Room', required: true },
  users: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }], // Users with access
  tasks: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Task' }], // Tasks related to this device
  creator: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true }, // Creator of the device
  componentNumber: { type: String, required: true, unique: true }, // Unique hashed password
  activated: { type: Boolean, default: true }, // Activation flag, default true
  order: { type: Number, min: 1, max: 6, required: true }, // Order within the room - required from user
  
  // Google Assistant Integration Fields
  active: { type: Boolean, default: true }, // For Google Assistant filtering
  brightness: { type: Number, min: 0, max: 100 }, // For dimmable lights
  color: { // For color-changing lights
    spectrumRgb: { type: Number }, // RGB color value
    temperatureK: { type: Number } // Color temperature in Kelvin
  },
  nicknames: [{ type: String }], // Alternative names for Google Assistant
  capabilities: {
    brightness: { type: Boolean, default: false }, // Can this device be dimmed?
    color: { type: Boolean, default: false } // Can this device change colors?
  },
  // Thermostat specific fields
  thermostatMode: { type: String, enum: ['heat', 'cool', 'auto', 'off'] },
  targetTemperature: { type: Number },
  currentTemperature: { type: Number },
  // Lock specific fields
  lockState: { type: String, enum: ['locked', 'unlocked'] }
}, { timestamps: true });

// Pre-save hook to generate a hashed component number
deviceSchema.pre('save', function (next) {
  if (this.isNew || this.isModified('name')) {
    const hash = crypto.createHash('sha256');
    this.componentNumber = hash.update(this.name + Date.now().toString()).digest('hex');
  }
  next();
});

module.exports = mongoose.model('Device', deviceSchema);