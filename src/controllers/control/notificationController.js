const Notification = require('../../models/Notification');
const User = require('../../models/User');

// Create a new notification
exports.createNotification = async (req, res) => {
  try {
    const { userId, type, title, message, status } = req.body;

    // Validate user
    const user = await User.findById(userId);
    if (!user) {
      return res.status(404).json({ success: false, message: 'User not found' });
    }

    // Create a new notification
    const notification = new Notification({
      user: userId,
      type,
      title,
      message,
      status: status || 'unread', // Default status is 'unread'
    });

    await notification.save();

    res.status(201).json({ success: true, data: notification });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Server Error', error: error.message });
  }
};

// Get all notifications for a specific user
exports.getUserNotifications = async (req, res) => {
  try {
    const userId = req.params.userId;

    // Validate user
    const user = await User.findById(userId);
    if (!user) {
      return res.status(404).json({ success: false, message: 'User not found' });
    }

    const notifications = await Notification.find({ user: userId }).sort({ createdAt: -1 });

    res.status(200).json({ success: true, data: notifications });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Server Error', error: error.message });
  }
};

// Get unread notifications for a specific user
exports.getUnreadNotifications = async (req, res) => {
  try {
    const userId = req.params.userId;

    // Validate user
    const user = await User.findById(userId);
    if (!user) {
      return res.status(404).json({ success: false, message: 'User not found' });
    }

    const unreadNotifications = await Notification.find({ user: userId, status: 'unread' });

    res.status(200).json({ success: true, data: unreadNotifications });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Server Error', error: error.message });
  }
};

// Update the status of a notification (e.g., mark as read)
exports.updateNotificationStatus = async (req, res) => {
  try {
    const { notificationId } = req.params;
    const { status } = req.body;

    // Validate status
    if (!['unread', 'read'].includes(status)) {
      return res.status(400).json({ success: false, message: 'Invalid status' });
    }

    const notification = await Notification.findById(notificationId);
    if (!notification) {
      return res.status(404).json({ success: false, message: 'Notification not found' });
    }

    // Update notification status
    notification.status = status;
    await notification.save();

    res.status(200).json({ success: true, data: notification });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Server Error', error: error.message });
  }
};

// Delete a notification
exports.deleteNotification = async (req, res) => {
  try {
    const { notificationId } = req.params;

    const notification = await Notification.findById(notificationId);
    if (!notification) {
      return res.status(404).json({ success: false, message: 'Notification not found' });
    }

    await notification.remove();

    res.status(200).json({ success: true, message: 'Notification deleted' });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Server Error', error: error.message });
  }
};

// Get notifications of a specific type for a user
exports.getUserNotificationsByType = async (req, res) => {
  try {
    const { userId, type } = req.params;

    // Validate user
    const user = await User.findById(userId);
    if (!user) {
      return res.status(404).json({ success: false, message: 'User not found' });
    }

    // Validate type
    if (!['email', 'sms', 'push', 'in-app', 'task', 'device', 'alert', 'promotion'].includes(type)) {
      return res.status(400).json({ success: false, message: 'Invalid notification type' });
    }

    const notifications = await Notification.find({ user: userId, type }).sort({ createdAt: -1 });

    res.status(200).json({ success: true, data: notifications });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Server Error', error: error.message });
  }
};