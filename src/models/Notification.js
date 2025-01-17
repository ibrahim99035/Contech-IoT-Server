const mongoose = require('mongoose');

const notificationSchema = new mongoose.Schema({
  user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true }, // Target user
  type: { 
    type: String, 
    enum: ['email', 'sms', 'push', 'in-app', 'task', 'device', 'alert', 'promotion'], 
    required: true 
  }, // Type of notification
  title: { type: String, required: true }, // Notification title
  message: { type: String, required: true }, // Notification message
  status: { 
    type: String, 
    enum: ['pending', 'sent', 'failed', 'unread', 'read'], 
    default: 'unread' 
  }, // Status of the notification
  createdAt: { type: Date, default: Date.now }, // When it was created
}, { timestamps: true });

module.exports = mongoose.model('Notification', notificationSchema);