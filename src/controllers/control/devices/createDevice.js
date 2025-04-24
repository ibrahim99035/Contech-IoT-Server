/**
 * Device Controller - handles the creation of IoT devices
 * @module controllers/DeviceController
 */

const Device = require('../../../models/Device');
const Room = require('../../../models/Room');
const User = require('../../../models/User');
const { Subscription } = require('../../../models/subscriptionSystemModels');
const { deviceSchema } = require('../../../validation/deviceValidation');

/**
 * Creates a new device in the specified room
 * 
 * @async
 * @function createDevice
 * @param {Object} req - Express request object
 * @param {Object} req.body - Request body containing device details
 * @param {string} req.body.name - Device name
 * @param {string} req.body.type - Device type (e.g., Light, Thermostat)
 * @param {string} req.body.room - Room ID where device will be installed
 * @param {Object} req.user - Authenticated user information
 * @param {Object} res - Express response object
 * @returns {Object} JSON response with device data or error message
 */
exports.createDevice = async (req, res) => {
  const session = await Device.startSession();
  session.startTransaction();
  
  try {
    // Validate request body against schema
    const { error } = deviceSchema.validate(req.body);
    if (error) {
      return res.status(400).json({
        success: false,
        message: 'Validation error',
        error: error.details[0].message,
        code: 'VALIDATION_ERROR'
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

    // Fetch and validate room
    const room = await Room.findById(req.body.room)
      .populate('devices')
      .session(session);
      
    if (!room) {
      return res.status(404).json({
        success: false,
        message: 'Room not found',
        code: 'ROOM_NOT_FOUND'
      });
    }

    // Verify user permission (only room creator can add devices)
    if (room.creator.toString() !== req.user._id.toString()) {
      return res.status(403).json({
        success: false,
        message: 'Permission denied: only the room creator can add devices',
        code: 'PERMISSION_DENIED'
      });
    }

    // Check subscription limits
    const userSubscription = await Subscription.findOne({ user: req.user._id })
      .populate('subscriptionPlan')
      .session(session);
      
    if (!userSubscription || !userSubscription.subscriptionPlan) {
      return res.status(400).json({
        success: false,
        message: 'No active subscription found',
        code: 'NO_SUBSCRIPTION'
      });
    }

    // Determine device limit based on subscription plan
    const subscriptionPlanName = userSubscription.subscriptionPlan.name.toLowerCase();
    const deviceLimit = 
      subscriptionPlanName === 'free' ? 2 : 
      subscriptionPlanName === 'gold' ? 4 : 6;

    // Check if room has reached device limit
    if (room.devices.length >= deviceLimit) {
      return res.status(403).json({
        success: false,
        message: `Subscription limit reached: your ${userSubscription.subscriptionPlan.name} plan allows only ${deviceLimit} devices per room`,
        code: 'SUBSCRIPTION_LIMIT',
        limit: {
          current: room.devices.length,
          maximum: deviceLimit,
          plan: userSubscription.subscriptionPlan.name
        }
      });
    }

    // Create new device
    const device = new Device({ 
      ...req.body, 
      creator: req.user._id,
      status: req.body.status || 'off' // Default status if not provided
    });
    
    await device.save({ session });

    // Update room with new device
    await Room.findByIdAndUpdate(
      req.body.room, 
      { $push: { devices: device._id } }, 
      { session }
    );

    // Commit transaction
    await session.commitTransaction();
    session.endSession();

    // Return success response with device data
    res.status(201).json({
      success: true,
      message: 'Device created successfully',
      data: {
        device: {
          _id: device._id,
          name: device.name,
          type: device.type,
          status: device.status,
          room: device.room,
          creator: device.creator,
          componentNumber: device.componentNumber,
          createdAt: device.createdAt
        },
        room: {
          _id: room._id,
          name: room.name,
          devicesCount: room.devices.length + 1
        }
      }
    });
    
  } catch (error) {
    // Rollback transaction on error
    await session.abortTransaction();
    session.endSession();
    
    // Return error response
    res.status(500).json({
      success: false,
      message: 'Error creating device',
      error: error.message,
      code: 'SERVER_ERROR'
    });
  }
};