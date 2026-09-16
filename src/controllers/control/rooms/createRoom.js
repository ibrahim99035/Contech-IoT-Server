const Room = require('../../../models/Room');
const Apartment = require('../../../models/Apartment');
const User = require('../../../models/User');
const mongoose = require('mongoose');
const { roomSchema } = require('../../../validation/roomValidation');
const { checkRoomLimits } = require('../../../middleware/checkSubscriptionLimits');

exports.createRoom = async (req, res) => {
  let session = null;
  let useTransaction = false;

  try {
    const { error } = roomSchema.validate(req.body);
    if (error) {
      return res.status(400).json({ 
        success: false, 
        message: error.details[0].message 
      });
    }

    try {
      session = await mongoose.startSession();
      session.startTransaction();
      useTransaction = true;
    } catch (e) {
      session = null;
      useTransaction = false;
    }

    const apartment = await Apartment.findById(req.body.apartment);
    if (!apartment) {
      if (useTransaction && session) {
        await session.abortTransaction();
        session.endSession();
      }
      return res.status(404).json({ 
        success: false, 
        message: 'Apartment not found' 
      });
    }

    if (apartment.creator.toString() !== req.user._id.toString()) {
      if (useTransaction && session) {
        await session.abortTransaction();
        session.endSession();
      }
      return res.status(403).json({ 
        success: false, 
        message: 'Only the creator of the apartment can create rooms' 
      });
    }

    const roomData = { 
      ...req.body, 
      creator: req.user._id,
      users: [req.user._id],
      type: req.body.type || 'other',
    };

    let roomIdCreated;
    if (useTransaction && session) {
      try {
        const room = await Room.create([roomData], { session });
        await Apartment.findByIdAndUpdate(
          req.body.apartment, 
          { $push: { rooms: room[0]._id } }, 
          { session }
        );
        await session.commitTransaction();
        session.endSession();
        roomIdCreated = room[0]._id;
      } catch (txError) {
        if (session.inTransaction()) await session.abortTransaction();
        session.endSession();
        const room = await Room.create(roomData);
        await Apartment.findByIdAndUpdate(req.body.apartment, { $push: { rooms: room._id } });
        roomIdCreated = room._id;
      }
    } else {
      const room = await Room.create(roomData);
      await Apartment.findByIdAndUpdate(req.body.apartment, { $push: { rooms: room._id } });
      roomIdCreated = room._id;
    }

    const populatedRoom = await Room.findById(roomIdCreated)
      .populate('users', 'name email')
      .populate('creator', 'name email');

    return res.status(201).json({
      success: true,
      data: { room: populatedRoom },
      message: 'Room created successfully'
    });

  } catch (error) {
    if (session && session.inTransaction()) {
      await session.abortTransaction();
      session.endSession();
    }
    
    return res.status(500).json({ 
      success: false,
      message: error.message || 'An error occurred while creating the room'
    });
  }
};