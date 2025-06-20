/**
 * Get Available Orders Controller - handles retrieving available device orders
 * @module controllers/GetAvailableOrdersController
 */

const Device = require('../../../models/Device');
const Room = require('../../../models/Room'); // Import Room model
const mongoose = require('mongoose'); // Import mongoose for ObjectId validation
 
/**
 * Gets available orders (1-6) for a specific room and returns current device order
 * 
 * @async
 * @function getAvailableOrders
 * @param {Object} req - Express request object
 * @param {Object} req.params - Route parameters
 * @param {string} req.params.roomId - Room ID to check available orders
 * @param {string} req.params.deviceId - Device ID to get current order (optional)
 * @param {Object} req.user - Authenticated user information
 * @param {Object} res - Express response object
 * @returns {Object} JSON response with available orders and current device order
 */
exports.getAvailableOrders = async (req, res) => {
  try {
    const { roomId, deviceId } = req.params;

    // Check authentication
    if (!req.user?._id) {
      return res.status(401).json({
        success: false,
        message: 'Authentication required',
        code: 'UNAUTHORIZED'
      });
    }

    // Validate roomId
    if (!roomId) {
      return res.status(400).json({
        success: false,
        message: 'Room ID is required',
        code: 'MISSING_ROOM_ID'
      });
    }
    if (!mongoose.Types.ObjectId.isValid(roomId)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid Room ID format',
        code: 'INVALID_ID_FORMAT'
      });
    }

    // Validate deviceId if provided
    if (deviceId && !mongoose.Types.ObjectId.isValid(deviceId)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid Device ID format',
        code: 'INVALID_ID_FORMAT'
      });
    }

    // Find the room directly by its ID
    const room = await Room.findById(roomId);
    if (!room) {
      return res.status(404).json({
        success: false,
        message: 'Room not found',
        code: 'ROOM_NOT_FOUND'
      });
    }

    // Verify user permission (only room creator can manage device orders)
    // This uses the 'creator' field from the directly fetched 'room' object.
    if (room.creator.toString() !== req.user._id.toString()) {
      return res.status(403).json({
        success: false,
        message: 'Permission denied: only the room creator can manage device orders',
        code: 'PERMISSION_DENIED'
      });
    }

    // Get all activated devices in the room with their orders
    // This assumes the Device model has a 'room' field (ObjectId) and 'activated' field (Boolean).
    const devicesInRoom = await Device.find({ 
      room: roomId, 
      activated: true 
    }).select('_id name order'); // No need to populate room info, we already have it.

    let currentDeviceData = null;
    if (deviceId) {
      const targetDevice = await Device.findById(deviceId).select('_id name order room activated');
      
      if (!targetDevice) {
        return res.status(404).json({
          success: false,
          message: 'Device not found',
          code: 'DEVICE_NOT_FOUND'
        });
      }

      // Ensure the device belongs to the specified room
      if (!targetDevice.room || targetDevice.room.toString() !== roomId) {
        return res.status(400).json({
          success: false,
          message: 'Device does not belong to the specified room',
          code: 'DEVICE_ROOM_MISMATCH'
        });
      }

      // Ensure the device is activated if we're getting its order details
      if (!targetDevice.activated) {
        return res.status(400).json({
          success: false,
          message: 'Cannot get available orders for a deactivated device',
          code: 'DEVICE_DEACTIVATED'
        });
      }
      currentDeviceData = {
        _id: targetDevice._id,
        name: targetDevice.name,
        currentOrder: targetDevice.order // Assumes Device model has an 'order' field
      };
    }

    // Calculate available orders (1-6)
    const allOrders = [1, 2, 3, 4, 5, 6];
    
    // Occupied orders are from other activated devices in the room.
    // If a deviceId is provided, its current order is not considered "occupied" by others,
    // meaning it's available for the current device itself.
    const occupiedOrders = devicesInRoom
      .filter(d => d.order && (!deviceId || d._id.toString() !== deviceId))
      .map(d => d.order);
    
    const availableOrders = allOrders.filter(order => !occupiedOrders.includes(order));

    // Prepare response data
    const responseData = {
      room: {
        _id: room._id, // From the directly fetched room object
        name: room.name, // From the directly fetched room object
        totalActiveDevices: devicesInRoom.length // Count of active devices found
      },
      orders: {
        available: availableOrders.sort((a, b) => a - b),
        occupied: occupiedOrders.sort((a, b) => a - b),
        total: allOrders
      },
      // List of active devices in the room with their current orders
      activeDevicesInRoom: devicesInRoom.map(d => ({
        _id: d._id,
        name: d.name,
        order: d.order
      })).sort((a, b) => (a.order || 999) - (b.order || 999))
    };

    // Add current device info if provided and found
    if (currentDeviceData) {
      responseData.currentDevice = currentDeviceData;
    }

    res.status(200).json({
      success: true,
      message: 'Available orders retrieved successfully',
      data: responseData
    });

  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Error retrieving available orders',
      error: error.message,
      code: 'SERVER_ERROR'
    });
  }
};