const mongoose = require('mongoose');
const crypto = require('crypto');

const deviceSchema = new mongoose.Schema({
  name: { type: String, required: true },
  type: { type: String, required: true }, // E.g., Light, Thermostat, etc.
  status: { type: String, enum: ['on', 'off'], default: 'off' },
  room: { type: mongoose.Schema.Types.ObjectId, ref: 'Room', required: true },
  users: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }], // Users with access
  tasks: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Task' }], // Tasks related to this device
  creator: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true }, // Creator of the device
  componentNumber: { type: String, required: true, unique: true }, // Unique hashed password
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