const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');

const userSchema = new mongoose.Schema({
  name: { type: String, required: true },
  email: { type: String, required: true, unique: true },
  password: { type: String, required: true },
  role: { type: String, enum: ['admin', 'moderator', 'customer'], required: true },
  active: { type: Boolean, default: true },
  emailActivated: { type: Boolean, default: false },
  contactInfo: { type: String },
  googleId: { type: String }, // Added for Google OAuth
  apartments: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Apartment' }], // Linked apartments
  devices: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Device' }], // Devices accessible
  tasks: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Task' }], // User's tasks
}, { timestamps: true });

// Hash the password before saving
userSchema.pre('save', async function (next) {
  if (!this.isModified('password')) {
    next();
  }
  const salt = await bcrypt.genSalt(10);
  this.password = await bcrypt.hash(this.password, salt);
  next();
});

// Method to match entered password with hashed password
userSchema.methods.matchPassword = async function (enteredPassword) {
  return await bcrypt.compare(enteredPassword, this.password);
};

module.exports = mongoose.model('User', userSchema);