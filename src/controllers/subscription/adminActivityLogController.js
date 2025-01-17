const { AdminActivityLog } = require('../../models/subscriptionSystemModels');

// Log an admin activity
exports.logAdminActivity = async (adminId, action, details) => {
  try {
    const log = new AdminActivityLog({ admin: adminId, action, details });
    await log.save();
  } catch (error) {
    console.error('Failed to log admin activity:', error.message);
  }
};

// Retrieve all admin activities
exports.getAdminActivities = async (req, res) => {
  try {
    const logs = await AdminActivityLog.find().populate('admin', 'name email');
    res.status(200).json({ success: true, data: logs });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Server Error', error: error.message });
  }
};