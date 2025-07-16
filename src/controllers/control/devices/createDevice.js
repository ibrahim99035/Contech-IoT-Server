const Device = require('../../../models/Device');
const Room = require('../../../models/Room');
const User = require('../../../models/User');
const { deviceSchema } = require('../../../validation/deviceValidation');
const { checkDeviceLimits } = require('../../../middleware/checkSubscriptionLimits');

exports.createDevice = async (req, res) => {
  const session = await Device.startSession();
  session.startTransaction();
  
  try {
    // Validate request body
    const { error } = deviceSchema.validate(req.body);
    if (error) {
      await session.abortTransaction();
      session.endSession();
      return res.status(400).json({
        success: false,
        message: 'Validation error',
        error: error.details[0].message
      });
    }

    // Fetch and validate room
    const room = await Room.findById(req.body.room).session(session);
    if (!room) {
      await session.abortTransaction();
      session.endSession();
      return res.status(404).json({
        success: false,
        message: 'Room not found'
      });
    }

    // Verify permissions
    if (room.creator.toString() !== req.user._id.toString()) {
      await session.abortTransaction();
      session.endSession();
      return res.status(403).json({
        success: false,
        message: 'Permission denied: only the room creator can add devices'
      });
    }

    // Check order position
    const existingDeviceWithOrder = await Device.findOne({ 
      room: req.body.room, 
      order: req.body.order 
    }).session(session);
    
    if (existingDeviceWithOrder) {
      await session.abortTransaction();
      session.endSession();
      return res.status(400).json({
        success: false,
        message: `Order position ${req.body.order} is already taken in this room`
      });
    }

    // The limit check is now handled by middleware
    const deviceData = { 
      ...req.body, 
      creator: req.user._id,
      users: [req.user._id],
      status: req.body.status || 'off'
    };

    if (req.body.type === 'Lock') {
      deviceData.status = req.body.status || 'locked';
      deviceData.lockState = req.body.lockState || 'locked';
    }

    const device = new Device(deviceData);
    await device.save({ session });

    await Room.findByIdAndUpdate(
      req.body.room, 
      { $push: { devices: device._id } }, 
      { session }
    );

    await User.findByIdAndUpdate(
      req.user._id,
      { $push: { devices: device._id } },
      { session }
    );

    await session.commitTransaction();
    session.endSession();

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
          users: device.users, 
          componentNumber: device.componentNumber,
          order: device.order,
          lockState: device.lockState,
          createdAt: device.createdAt
        }
      }
    });
    
  } catch (error) {
    await session.abortTransaction();
    session.endSession();
    
    res.status(500).json({
      success: false,
      message: 'Error creating device',
      error: error.message
    });
  }
};