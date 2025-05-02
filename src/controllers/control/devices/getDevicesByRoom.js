/**
 * Device Controller - handles retrieval of devices by room
 * @module controllers/DeviceController
 */

const Device = require('../../../models/Device');
const Room = require('../../../models/Room');
const mongoose = require('mongoose');

/**
 * Retrieves devices belonging to a specific room that the user has access to
 * 
 * @async
 * @function getDevicesByRoom
 * @param {Object} req - Express request object
 * @param {Object} req.params - Route parameters
 * @param {string} req.params.roomId - ID of the room to fetch devices from
 * @param {Object} req.user - Authenticated user information
 * @param {Object} res - Express response object
 * @returns {Object} JSON response with devices data or error message
 */
exports.getDevicesByRoom = async (req, res) => {
  try {
    // Get roomId from params instead of query
    const roomId = req.params.roomId || req.query.roomId;
    
    if (!roomId) {
      return res.status(400).json({
        success: false,
        message: 'Room ID is required',
        code: 'MISSING_ROOM_ID'
      });
    }

    // Validate room ID format
    if (!mongoose.Types.ObjectId.isValid(roomId)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid room ID format',
        code: 'INVALID_ID_FORMAT'
      });
    }

    // Check authentication
    if (!req.user?._id) {
      return res.status(401).json({
        success: false,
        message: 'Authentication required',
        code: 'UNAUTHORIZED'
      });
    }

    // Find the requested room
    const room = await Room.findById(roomId).populate('creator', 'name email');
    if (!room) {
      return res.status(404).json({
        success: false,
        message: 'Room not found',
        code: 'ROOM_NOT_FOUND'
      });
    }

    // Check if user has access to the room
    const isCreator = room.creator._id.toString() === req.user._id.toString();
    const isMember = room.users.some(userId => userId.toString() === req.user._id.toString());
    
    if (!isCreator && !isMember) {
      return res.status(403).json({
        success: false,
        message: 'Access denied: you must be the room creator or member to view devices',
        code: 'ACCESS_DENIED'
      });
    }

    // Fetch only devices where the current user is in the users array
    // or is the creator of the device
    const devices = await Device.find({
      room: roomId,
      $or: [
        { users: req.user._id },         // User is in the users array
        { creator: req.user._id }        // User is the creator
      ]
    })
      .populate('creator', 'name email')
      .populate('users', 'name email')
      .lean();

    // Return success response with devices data
    res.status(200).json({
      success: true,
      message: 'Devices retrieved successfully',
      data: {
        room: {
          _id: room._id,
          name: room.name,
          creator: room.creator
        },
        devices: devices.map(device => ({
          _id: device._id,
          name: device.name,
          type: device.type,
          status: device.status,
          componentNumber: device.componentNumber,
          creator: device.creator,
          users: device.users,
          createdAt: device.createdAt,
          updatedAt: device.updatedAt
        })),
        count: devices.length
      }
    });
  } catch (error) {
    console.error('Error in getDevicesByRoom:', error);
    // Return error response
    res.status(500).json({
      success: false,
      message: 'Error fetching devices',
      error: error.message,
      code: 'SERVER_ERROR'
    });
  }
};