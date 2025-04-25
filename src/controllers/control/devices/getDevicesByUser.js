/**
 * Device Controller - handles retrieval of devices by user
 * @module controllers/DeviceController
 */

const Device = require('../../../models/Device');
const mongoose = require('mongoose');

/**
 * Retrieves all devices the authenticated user has access to
 * 
 * @async
 * @function getDevicesByUser
 * @param {Object} req - Express request object
 * @param {Object} req.user - Authenticated user information
 * @param {Object} res - Express response object
 * @returns {Object} JSON response with devices data or error message
 */
exports.getDevicesByUser = async (req, res) => {
  try {
    // Ensure the user is authenticated
    const userId = req.user?._id;

    if (!userId) {
      return res.status(401).json({
        success: false,
        message: 'Authentication required',
        code: 'UNAUTHORIZED'
      });
    }

    // Validate the ObjectId format
    if (!mongoose.Types.ObjectId.isValid(userId)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid user ID format',
        code: 'INVALID_ID_FORMAT'
      });
    }

    // Fetch devices where the user has access (is listed in `users` array)
    const devices = await Device.find({ users: userId })
      .populate('room', 'name apartment') // Optionally: .populate({ path: 'room', populate: { path: 'apartment', select: 'name' } })
      .populate('creator', 'name email')
      .populate('users', 'name email')
      .lean();

    // Return structured response
    res.status(200).json({
      success: true,
      message: 'Devices retrieved successfully',
      data: {
        user: {
          _id: userId,
          name: req.user.name,
          email: req.user.email
        },
        devices: devices.map(device => ({
          _id: device._id,
          name: device.name,
          type: device.type,
          status: device.status,
          componentNumber: device.componentNumber,
          room: device.room,
          creator: device.creator,
          users: device.users,
          createdAt: device.createdAt,
          updatedAt: device.updatedAt
        })),
        count: devices.length
      }
    });
  } catch (error) {
    console.error('Error in getDevicesByUser:', error);
    res.status(500).json({
      success: false,
      message: 'Error fetching user devices',
      error: error.message,
      code: 'SERVER_ERROR'
    });
  }
};
