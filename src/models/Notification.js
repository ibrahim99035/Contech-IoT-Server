const mongoose = require('mongoose');

const notificationSchema = new mongoose.Schema({
  user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true }, // Target user
  type: { 
    type: String, 
    enum: ['task', 'device', 'alert', 'promotion'], 
    required: true 
  }, // Type of notification
  title: { type: String, required: true },
  message: { type: String, required: true },
  status: { 
    type: String, 
    enum: ['unread', 'read'], 
    default: 'unread' 
  },
  createdAt: { type: Date, default: Date.now },
}, { timestamps: true });

module.exports = mongoose.model('Notification', notificationSchema);