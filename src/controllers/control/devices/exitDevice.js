// controllers/api/device/exitDevice.js
const Device = require('../../../models/Device');
const mongoose = require('mongoose');

/**
 * Controller for users to exit a device themselves
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 */
exports.exitDevice = async (req, res) => {
  try {
    const { deviceId } = req.params;
    const userId = req.user._id;
    
    // Validate device ID
    if (!mongoose.Types.ObjectId.isValid(deviceId)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid device ID format',
        data: null
      });
    }
    
    // Find the device
    const device = await Device.findById(deviceId);
    
    // Check if device exists
    if (!device) {
      return res.status(404).json({
        success: false,
        message: 'Device not found',
        data: null
      });
    }
    
    // Check if user is the creator (creators can't exit their own devices)
    if (device.creator.equals(userId)) {
      return res.status(400).json({
        success: false,
        message: 'Device creator cannot exit their own device. Consider deleting the device instead.',
        data: null
      });
    }
    
    // Check if the user is assigned to the device
    if (!device.users.some(user => user.equals(userId))) {
      return res.status(400).json({
        success: false,
        message: 'You do not have access to this device',
        data: null
      });
    }
    
    // Remove the user from the device users
    device.users = device.users.filter(user => !user.equals(userId));
    
    // Save the updated device
    await device.save();
    
    // Return success response
    return res.status(200).json({
      success: true,
      message: 'You have successfully removed yourself from the device',
      data: {
        deviceId: device._id,
        deviceName: device.name,
        remainingUsers: device.users.length
      }
    });
    
  } catch (error) {
    console.error('Error exiting device:', error);
    return res.status(500).json({
      success: false,
      message: 'Server error while exiting device',
      error: process.env.NODE_ENV === 'production' ? 'Internal server error' : error.message
    });
  }
};