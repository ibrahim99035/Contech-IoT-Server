// controllers/api/device/getDeviceUsers.js
const Device = require('../../../models/Device');
const mongoose = require('mongoose');

/**
 * Get all users assigned to a specific device
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 */
exports.getDeviceUsers = async (req, res) => {
  try {
    const { deviceId } = req.params;
    
    // Validate device ID
    if (!mongoose.Types.ObjectId.isValid(deviceId)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid device ID format',
        data: null
      });
    }
    
    // Find the device with populated users
    const device = await Device.findById(deviceId)
      .populate('users', 'name email role')
      .populate('creator', 'name email role');
    
    // Check if device exists
    if (!device) {
      return res.status(404).json({
        success: false,
        message: 'Device not found',
        data: null
      });
    }
    
    // Check if current user has access to this device
    const currentUserId = req.user._id;
    const isCreator = device.creator._id.equals(currentUserId);
    const hasAccess = device.users.some(user => 
      user._id && user._id.equals(currentUserId)
    );
    
    if (!isCreator && !hasAccess) {
      return res.status(403).json({
        success: false,
        message: 'Permission denied: You do not have access to this device',
        data: null
      });
    }
    
    // Prepare response with creator and users
    const response = {
      deviceId: device._id,
      deviceName: device.name,
      deviceType: device.type,
      creator: {
        _id: device.creator._id,
        name: device.creator.name,
        email: device.creator.email,
        role: device.creator.role
      },
      users: device.users.map(user => ({
        _id: user._id,
        name: user.name,
        email: user.email,
        role: user.role
      })),
      totalUsers: device.users.length
    };
    
    // Return success response
    return res.status(200).json({
      success: true,
      message: 'Device users retrieved successfully',
      data: response
    });
    
  } catch (error) {
    console.error('Error getting device users:', error);
    return res.status(500).json({
      success: false,
      message: 'Server error while getting device users',
      error: process.env.NODE_ENV === 'production' ? 'Internal server error' : error.message
    });
  }
};