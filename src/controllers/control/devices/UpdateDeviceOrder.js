/**
 * Update Device Order Controller - handles updating device order
 * @module controllers/UpdateDeviceOrderController
 */

const Device = require('../../../models/Device');

/**
 * Updates the order of a specific device
 * 
 * @async
 * @function updateDeviceOrder
 * @param {Object} req - Express request object
 * @param {Object} req.params - Route parameters
 * @param {string} req.params.deviceId - Device ID to update
 * @param {Object} req.body - Request body containing new order
 * @param {number} req.body.order - New order number (1-6)
 * @param {Object} req.user - Authenticated user information
 * @param {Object} res - Express response object
 * @returns {Object} JSON response with updated device data or error message
 */
exports.updateDeviceOrder = async (req, res) => {
  const session = await Device.startSession();
  session.startTransaction();

  try {
    const { deviceId } = req.params;
    const { order } = req.body;

    // Validate request body
    if (!order || typeof order !== 'number' || order < 1 || order > 6 || !Number.isInteger(order)) {
      return res.status(400).json({
        success: false,
        message: 'Order must be an integer between 1 and 6',
        code: 'INVALID_ORDER'
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

    // Validate deviceId parameter
    if (!deviceId) {
      return res.status(400).json({
        success: false,
        message: 'Device ID is required',
        code: 'MISSING_DEVICE_ID'
      });
    }

    // Find the device and populate room information
    const device = await Device.findById(deviceId)
      .populate('room', 'name creator')
      .session(session);
      
    if (!device) {
      return res.status(404).json({
        success: false,
        message: 'Device not found',
        code: 'DEVICE_NOT_FOUND'
      });
    }

    // Verify device is activated
    if (!device.activated) {
      return res.status(400).json({
        success: false,
        message: 'Cannot update order for deactivated device',
        code: 'DEVICE_DEACTIVATED'
      });
    }

    // Verify room exists (should exist due to populate, but safety check)
    if (!device.room) {
      return res.status(404).json({
        success: false,
        message: 'Device room not found',
        code: 'ROOM_NOT_FOUND'
      });
    }

    // Verify user has permission (device creator or room creator)
    const isRoomCreator = device.room.creator.toString() === req.user._id.toString();
    const isDeviceCreator = device.creator.toString() === req.user._id.toString();

    if (!isRoomCreator && !isDeviceCreator) {
      return res.status(403).json({
        success: false,
        message: 'Permission denied: only room creator or device creator can update device order',
        code: 'PERMISSION_DENIED'
      });
    }

    // Check if the device already has this order
    if (device.order === order) {
      return res.status(400).json({
        success: false,
        message: `Device already has order ${order}`,
        code: 'ORDER_UNCHANGED',
        currentOrder: device.order
      });
    }

    // Check if the new order is already taken by another device in the same room
    const conflictingDevice = await Device.findOne({
      room: device.room._id,
      order: order,
      _id: { $ne: deviceId },
      activated: true
    }).select('_id name order').session(session);

    if (conflictingDevice) {
      return res.status(409).json({
        success: false,
        message: `Order ${order} is already taken by device "${conflictingDevice.name}"`,
        code: 'ORDER_CONFLICT',
        conflictingDevice: {
          _id: conflictingDevice._id,
          name: conflictingDevice.name,
          order: conflictingDevice.order
        }
      });
    }

    // Store previous order for response
    const previousOrder = device.order;

    // Update device order
    const updatedDevice = await Device.findByIdAndUpdate(
      deviceId,
      { order: order },
      { 
        new: true, 
        session,
        select: '_id name type status order room creator users createdAt updatedAt'
      }
    ).populate('room', 'name creator');

    // Commit transaction
    await session.commitTransaction();
    session.endSession();

    // Return success response
    res.status(200).json({
      success: true,
      message: 'Device order updated successfully',
      data: {
        device: {
          _id: updatedDevice._id,
          name: updatedDevice.name,
          type: updatedDevice.type,
          status: updatedDevice.status,
          order: updatedDevice.order,
          room: updatedDevice.room._id,
          creator: updatedDevice.creator,
          users: updatedDevice.users,
          createdAt: updatedDevice.createdAt,
          updatedAt: updatedDevice.updatedAt
        },
        orderChange: {
          previous: previousOrder,
          current: order
        },
        room: {
          _id: updatedDevice.room._id,
          name: updatedDevice.room.name
        }
      }
    });

  } catch (error) {
    // Rollback transaction on error
    await session.abortTransaction();
    session.endSession();

    res.status(500).json({
      success: false,
      message: 'Error updating device order',
      error: error.message,
      code: 'SERVER_ERROR'
    });
  }
};