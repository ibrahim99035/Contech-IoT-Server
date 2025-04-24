// controllers/api/device/removeUserFromDevice.js
const Device = require('../../../models/Device');
const mongoose = require('mongoose');

/**
 * Remove a user from a device (for device owners/admins)
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 */
exports.removeUserFromDevice = async (req, res) => {
  try {
    const { deviceId, userId } = req.params;
    
    // Validate ObjectIds
    if (!mongoose.Types.ObjectId.isValid(deviceId) || !mongoose.Types.ObjectId.isValid(userId)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid device or user ID format',
        data: null
      });
    }

    // Find the device
    const device = await Device.findById(deviceId).populate('creator', 'name');
    
    // Check if device exists
    if (!device) {
      return res.status(404).json({
        success: false,
        message: 'Device not found',
        data: null
      });
    }
    
    // Check if current user is the device creator
    if (!device.creator._id.equals(req.user._id)) {
      return res.status(403).json({
        success: false,
        message: 'Permission denied: Only the device creator can remove users',
        data: null
      });
    }
    
    // Check if trying to remove the creator (which is not allowed)
    if (device.creator._id.equals(userId)) {
      return res.status(400).json({
        success: false,
        message: 'Cannot remove the creator from their own device',
        data: null
      });
    }
    
    // Check if the user exists in the device's users
    if (!device.users.some(user => user.equals(userId))) {
      return res.status(404).json({
        success: false,
        message: 'User not found on this device',
        data: null
      });
    }
    
    // Remove the user from the device
    device.users = device.users.filter(user => !user.equals(userId));
    
    // Save the updated device
    await device.save();
    
    return res.status(200).json({
      success: true,
      message: 'User removed from device successfully',
      data: {
        deviceId: device._id,
        deviceName: device.name,
        remainingUsers: device.users.length
      }
    });
    
  } catch (error) {
    console.error('Error removing user from device:', error);
    return res.status(500).json({
      success: false,
      message: 'Server error while removing user from device',
      error: process.env.NODE_ENV === 'production' ? 'Internal server error' : error.message
    });
  }
};