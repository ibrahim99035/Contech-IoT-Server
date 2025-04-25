const Room = require('../../../models/Room');
const Apartment = require('../../../models/Apartment');
const User = require('../../../models/User');
const mongoose = require('mongoose');

/**
 * Add users to a room
 * Automatically adds users to parent apartment if they're not already members
 * 
 * @async
 * @function addUsersToRoom
 * @param {Object} req - Express request object
 * @param {Object} req.params - Route parameters
 * @param {string} req.params.id - Room ID
 * @param {Object} req.body - Request body
 * @param {Array} req.body.userIds - Array of user IDs to add to room
 * @param {Object} req.user - Authenticated user information
 * @param {Object} res - Express response object
 * @returns {Object} JSON response with details about added users
 */
exports.addUsersToRoom = async (req, res) => {
  const session = await mongoose.startSession();
  session.startTransaction();
  
  try {
    const roomId = req.params.id;
    let { userIds } = req.body;
    
    // Validate room ID
    if (!mongoose.Types.ObjectId.isValid(roomId)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid room ID format',
        data: null
      });
    }
    
    // Validate userIds input
    if (!userIds || !Array.isArray(userIds) || userIds.length === 0) {
      return res.status(400).json({
        success: false,
        message: 'userIds must be a non-empty array',
        data: null
      });
    }
    
    // Filter valid ObjectIds and remove duplicates
    const validUserIds = [...new Set(
      userIds.filter(id => mongoose.Types.ObjectId.isValid(id))
    )];
    
    // Check if any valid userIds remain after filtering
    if (validUserIds.length === 0) {
      return res.status(400).json({
        success: false,
        message: 'No valid user IDs provided',
        data: null
      });
    }
    
    // Find room with session
    const room = await Room.findById(roomId).session(session);
    if (!room) {
      await session.abortTransaction();
      session.endSession();
      return res.status(404).json({
        success: false,
        message: 'Room not found',
        data: null
      });
    }
    
    // Check permission
    if (room.creator.toString() !== req.user._id.toString()) {
      await session.abortTransaction();
      session.endSession();
      return res.status(403).json({
        success: false,
        message: 'Permission denied: Only the creator can add users to this room',
        data: null
      });
    }
    
    // Fetch the apartment
    const apartment = await Apartment.findById(room.apartment).session(session);
    if (!apartment) {
      await session.abortTransaction();
      session.endSession();
      return res.status(404).json({
        success: false,
        message: 'Associated apartment not found',
        data: null
      });
    }

    // Check if all users exist
    const existingUsers = await User.find({ _id: { $in: validUserIds } }).session(session);
    const existingUserIds = existingUsers.map(user => user._id.toString());
    const nonExistentUserIds = validUserIds.filter(id => !existingUserIds.includes(id));
    
    if (nonExistentUserIds.length > 0) {
      await session.abortTransaction();
      session.endSession();
      return res.status(400).json({
        success: false,
        message: 'One or more user IDs do not exist',
        data: {
          invalidUserIds: nonExistentUserIds
        }
      });
    }

    // Remove creator from the list (if included)
    const filteredUserIds = validUserIds.filter(id => 
      id !== req.user._id.toString()
    );

    // Check if any users remain to be added after filtering
    if (filteredUserIds.length === 0) {
      await session.abortTransaction();
      session.endSession();
      return res.status(400).json({
        success: false,
        message: 'No valid users to add (creator cannot be added as a user)',
        data: null
      });
    }

    // Convert apartment members and creator to string array for comparison
    const apartmentMembers = apartment.members.map(id => id.toString());
    apartmentMembers.push(apartment.creator.toString()); // Include creator
    
    // Identify users who are not apartment members yet
    const newToApartment = filteredUserIds.filter(id => !apartmentMembers.includes(id));
    
    // Add new users to apartment if they're not already members
    if (newToApartment.length > 0) {
      // Add users to apartment members
      apartment.members = [...apartment.members, ...newToApartment.map(id => new mongoose.Types.ObjectId(id))];
      await apartment.save({ session });
      
      // Update users' apartments array
      for (const userId of newToApartment) {
        await User.findByIdAndUpdate(
          userId,
          { $addToSet: { apartments: apartment._id } },
          { session }
        );
      }
    }

    // Convert existing room users to strings for comparison
    const existingRoomUsers = room.users.map(id => id.toString());

    // Find new users that aren't already in the room
    const newToRoom = filteredUserIds.filter(id => !existingRoomUsers.includes(id));

    // Check if there are any new users to add to the room
    if (newToRoom.length === 0) {
      await session.commitTransaction();
      session.endSession();
      return res.status(200).json({
        success: true,
        message: 'All valid users are already in the room',
        data: {
          room,
          addedToApartment: newToApartment,
          addedToRoom: []
        }
      });
    }

    // Add new users to room
    room.users = [...existingRoomUsers, ...newToRoom.map(id => new mongoose.Types.ObjectId(id))];

    // Save updated room
    const updatedRoom = await room.save({ session });

    // Commit the transaction
    await session.commitTransaction();
    session.endSession();

    // Return success response with detailed information
    return res.status(200).json({
      success: true,
      message: 'Users added successfully',
      data: {
        room: updatedRoom,
        addedToApartment: newToApartment,
        addedToRoom: newToRoom,
        apartmentUpdated: newToApartment.length > 0,
        stats: {
          addedToApartmentCount: newToApartment.length,
          addedToRoomCount: newToRoom.length,
          totalRoomUsers: updatedRoom.users.length
        }
      }
    });

  } catch (error) {
    await session.abortTransaction();
    session.endSession();
    console.error('Error adding users to room:', error);
    return res.status(500).json({
      success: false,
      message: 'Server error while adding users to room',
      error: process.env.NODE_ENV === 'production' ? 'Internal server error' : error.message
    });
  }
};