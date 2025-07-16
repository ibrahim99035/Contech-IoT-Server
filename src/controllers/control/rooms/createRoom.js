const Room = require('../../../models/Room');
const Apartment = require('../../../models/Apartment');
const User = require('../../../models/User');
const mongoose = require('mongoose');
const { roomSchema } = require('../../../validation/roomValidation');
const { checkRoomLimits } = require('../../../middleware/checkSubscriptionLimits');

exports.createRoom = async (req, res) => {
  const session = await mongoose.startSession();
  session.startTransaction();
  
  try {
    // Input validation
    const { error } = roomSchema.validate(req.body);
    if (error) {
      await session.abortTransaction();
      session.endSession();
      return res.status(400).json({ 
        success: false, 
        message: error.details[0].message 
      });
    }

    // Find the apartment
    const apartment = await Apartment.findById(req.body.apartment).session(session);
    if (!apartment) {
      await session.abortTransaction();
      session.endSession();
      return res.status(404).json({ 
        success: false, 
        message: 'Apartment not found' 
      });
    }

    // Check permissions
    if (apartment.creator.toString() !== req.user._id.toString()) {
      await session.abortTransaction();
      session.endSession();
      return res.status(403).json({ 
        success: false, 
        message: 'Only the creator of the apartment can create rooms' 
      });
    }

    // The limit check is now handled by middleware
    const roomData = { 
      ...req.body, 
      creator: req.user._id,
      users: [req.user._id],
      type: req.body.type || 'other',
    };
    
    const room = await Room.create([roomData], { session });

    await Apartment.findByIdAndUpdate(
      req.body.apartment, 
      { $push: { rooms: room[0]._id } }, 
      { session }
    );

    await session.commitTransaction();
    session.endSession();

    const populatedRoom = await Room.findById(room[0]._id)
      .populate('users', 'name email')
      .populate('creator', 'name email');

    return res.status(201).json({
      success: true,
      data: populatedRoom,
      message: 'Room created successfully'
    });

  } catch (error) {
    await session.abortTransaction();
    session.endSession();
    
    return res.status(500).json({ 
      success: false,
      message: error.message || 'An error occurred while creating the room'
    });
  }
};