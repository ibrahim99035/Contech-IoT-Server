/**
 * Room Controller - Create Room
 * 
 * This controller handles the creation of a new room within an apartment.
 * It includes validation, permission checks, subscription limit verification,
 * and transaction management for data consistency.
 * 
 * @module controllers/room/createRoom
 */

const Room = require('../../../models/Room');
const Apartment = require('../../../models/Apartment');
const User = require('../../../models/User'); // Added User model import
const mongoose = require('mongoose');
const { Subscription } = require('../../../models/subscriptionSystemModels');
const { roomSchema } = require('../../../validation/roomValidation');

// Subscription plan room limits
const ROOM_LIMITS = {
  free: 3,
  gold: 8,
  premium: 15,
  default: 10
};

/**
 * Create a new room within an apartment
 * 
 * @param {Object} req - Express request object
 * @param {Object} req.body - Request body containing room details
 * @param {string} req.body.apartment - ID of the apartment to add the room to
 * @param {string} req.body.name - Name of the room
 * @param {Object} req.user - Authenticated user object
 * @param {string} req.user._id - ID of the authenticated user
 * @param {Object} res - Express response object
 * @returns {Object} Created room or error message
 */
exports.createRoom = async (req, res) => {
  const session = await mongoose.startSession();
  session.startTransaction();
  
  try {
    // Input validation using Joi schema
    const { error } = roomSchema.validate(req.body);
    if (error) {
      return res.status(400).json({ 
        success: false, 
        message: error.details[0].message 
      });
    }

    // Find the apartment and verify it exists
    const apartment = await Apartment.findById(req.body.apartment).session(session);
    if (!apartment) {
      await session.abortTransaction();
      session.endSession();
      return res.status(404).json({ 
        success: false, 
        message: 'Apartment not found' 
      });
    }

    // Check if user is the creator of the apartment
    if (apartment.creator.toString() !== req.user._id.toString()) {
      await session.abortTransaction();
      session.endSession();
      return res.status(403).json({ 
        success: false, 
        message: 'Only the creator of the apartment can create rooms' 
      });
    }

    // Check if user has a valid subscription
    const userSubscription = await Subscription.findOne({ 
      user: req.user._id,
      status: 'active' // Only consider active subscriptions
    }).populate('subscriptionPlan').session(session);
    
    if (!userSubscription) {
      await session.abortTransaction();
      session.endSession();
      return res.status(400).json({ 
        success: false, 
        message: 'User does not have a valid subscription' 
      });
    }

    // Check subscription room limits
    const subscriptionPlan = userSubscription.subscriptionPlan;
    const currentRoomCount = apartment.rooms.length;
    const maxRooms = ROOM_LIMITS[subscriptionPlan.name.toLowerCase()] || ROOM_LIMITS.default;

    if (currentRoomCount >= maxRooms) {
      await session.abortTransaction();
      session.endSession();
      return res.status(403).json({ 
        success: false, 
        message: `Your ${subscriptionPlan.name} plan allows only ${maxRooms} rooms per apartment. Upgrade your plan for more rooms.`,
        currentCount: currentRoomCount,
        limit: maxRooms
      });
    }

    // Fetch the user details that will be added to the room
    const creator = await User.findById(req.user._id).select('_id name email').session(session);
    if (!creator) {
      await session.abortTransaction();
      session.endSession();
      return res.status(404).json({
        success: false,
        message: 'Creator user details not found'
      });
    }

    // Create the room with metadata and user details
    const roomData = { 
      ...req.body, 
      creator: req.user._id,
      users: [req.user._id],
      createdAt: new Date(),
      metadata: {
        createdFrom: req.headers['user-agent'],
        ipAddress: req.ip
      }
    };
    
    const room = await Room.create([roomData], { session });

    // Update the apartment with the new room reference
    await Apartment.findByIdAndUpdate(
      req.body.apartment, 
      { 
        $push: { rooms: room[0]._id },
        $set: { updatedAt: new Date() }
      }, 
      { session }
    );

    // Commit the transaction
    await session.commitTransaction();
    session.endSession();

    // Fetch the newly created room with populated user details
    const populatedRoom = await Room.findById(room[0]._id)
      .populate('users', 'name email')
      .populate('creator', 'name email');

    // Return the created room with populated user details
    return res.status(201).json({
      success: true,
      data: populatedRoom,
      message: 'Room created successfully'
    });

  } catch (error) {
    // Abort the transaction on error
    await session.abortTransaction();
    session.endSession();
    
    // Determine appropriate status code
    const statusCode = error.status || 500;

    // Return appropriate error response
    return res.status(statusCode).json({ 
      success: false,
      message: error.message || 'An error occurred while creating the room',
      error: process.env.NODE_ENV === 'development' ? error.stack : undefined
    });
  }
};