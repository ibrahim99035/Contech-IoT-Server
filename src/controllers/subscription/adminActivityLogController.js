const asyncHandler = require('express-async-handler');
const { AdminActivityLog } = require('../../models/subscriptionSystemModels');
const { success } = require('../../utils/response');
const logger = require('../../config/logger');

// Log an admin activity (used internally by other controllers)
async function logAdminActivity(adminId, action, details) {
  try {
    await AdminActivityLog.create({ admin: adminId, action, details });
  } catch (error) {
    logger.error('Failed to log admin activity', { error: error.message });
  }
}

// Retrieve all admin activities
exports.getAdminActivities = asyncHandler(async (req, res) => {
  const logs = await AdminActivityLog.find().populate('admin', 'name email').sort({ timestamp: -1 });
  success(res, logs, 'Admin activities retrieved successfully');
});

module.exports.logAdminActivity = logAdminActivity;