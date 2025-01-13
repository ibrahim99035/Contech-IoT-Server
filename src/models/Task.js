const mongoose = require('mongoose');

const taskSchema = new mongoose.Schema({
  name: { type: String, required: true },
  description: { type: String },
  state: { type: String, enum: ['on', 'off'], required: true },
  scheduledTime: { type: Date, required: true },
  repeatInterval: { type: Number, default: null }, // In milliseconds, if periodic
  completed: { type: Boolean, default: false },
  device: { type: mongoose.Schema.Types.ObjectId, ref: 'Device', required: true },
  user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true }, // Creator of the task
  nextRun: { type: Date }, // For periodic tasks
}, { timestamps: true });

module.exports = mongoose.model('Task', taskSchema);