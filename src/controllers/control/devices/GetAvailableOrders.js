/**
 * Get Available Orders Controller - handles retrieving available device orders
 * @module controllers/GetAvailableOrdersController
 */

const Device = require('../../../models/Device');

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

    // Validate roomId parameter
    if (!roomId) {
      return res.status(400).json({
        success: false,
        message: 'Room ID is required',
        code: 'MISSING_ROOM_ID'
      });
    }

    // Get all devices in the room with their orders and populate room info
    const devicesInRoom = await Device.find({ 
      room: roomId, 
      activated: true 
    }).populate('room', 'name creator').select('_id name order room');

    // Check if room exists by checking if any devices were found or get room info from first device
    if (devicesInRoom.length === 0) {
      // Check if room exists by trying to find any device (even deactivated) in this room
      const anyDeviceInRoom = await Device.findOne({ room: roomId }).populate('room', 'name creator');
      
      if (!anyDeviceInRoom || !anyDeviceInRoom.room) {
        return res.status(404).json({
          success: false,
          message: 'Room not found',
          code: 'ROOM_NOT_FOUND'
        });
      }

      // Room exists but no active devices - check permission
      if (anyDeviceInRoom.room.creator.toString() !== req.user._id.toString()) {
        return res.status(403).json({
          success: false,
          message: 'Permission denied: only the room creator can manage device orders',
          code: 'PERMISSION_DENIED'
        });
      }

      // Return response with no devices
      return res.status(200).json({
        success: true,
        message: 'Available orders retrieved successfully',
        data: {
          room: {
            _id: anyDeviceInRoom.room._id,
            name: anyDeviceInRoom.room.name,
            totalDevices: 0
          },
          orders: {
            available: [1, 2, 3, 4, 5, 6],
            occupied: [],
            total: [1, 2, 3, 4, 5, 6]
          },
          devicesInRoom: []
        }
      });
    }

    // Get room info from first device
    const room = devicesInRoom[0].room;

    // Verify user permission (only room creator can manage device orders)
    if (room.creator.toString() !== req.user._id.toString()) {
      return res.status(403).json({
        success: false,
        message: 'Permission denied: only the room creator can manage device orders',
        code: 'PERMISSION_DENIED'
      });
    }

    // Get current device info if deviceId is provided
    let currentDevice = null;
    if (deviceId) {
      currentDevice = devicesInRoom.find(device => device._id.toString() === deviceId);
      
      if (!currentDevice) {
        // Device might exist but not in this room or not activated
        const deviceExists = await Device.findById(deviceId).select('_id name order room activated');
        
        if (!deviceExists) {
          return res.status(404).json({
            success: false,
            message: 'Device not found',
            code: 'DEVICE_NOT_FOUND'
          });
        }

        if (deviceExists.room.toString() !== roomId) {
          return res.status(400).json({
            success: false,
            message: 'Device does not belong to the specified room',
            code: 'DEVICE_ROOM_MISMATCH'
          });
        }

        if (!deviceExists.activated) {
          return res.status(400).json({
            success: false,
            message: 'Device is deactivated',
            code: 'DEVICE_DEACTIVATED'
          });
        }
      }
    }

    // Calculate available orders (1-6)
    const allOrders = [1, 2, 3, 4, 5, 6];
    const occupiedOrders = devicesInRoom
      .filter(device => device.order && device._id.toString() !== deviceId)
      .map(device => device.order);
    
    const availableOrders = allOrders.filter(order => !occupiedOrders.includes(order));

    // Prepare response data
    const responseData = {
      room: {
        _id: room._id,
        name: room.name,
        totalDevices: devicesInRoom.length
      },
      orders: {
        available: availableOrders.sort((a, b) => a - b),
        occupied: occupiedOrders.sort((a, b) => a - b),
        total: allOrders
      },
      devicesInRoom: devicesInRoom.map(device => ({
        _id: device._id,
        name: device.name,
        order: device.order
      })).sort((a, b) => (a.order || 999) - (b.order || 999))
    };

    // Add current device info if provided and found
    if (currentDevice) {
      responseData.currentDevice = {
        _id: currentDevice._id,
        name: currentDevice.name,
        currentOrder: currentDevice.order
      };
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