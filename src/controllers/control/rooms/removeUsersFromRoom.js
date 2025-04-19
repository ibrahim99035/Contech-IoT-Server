const Room = require('../../../models/Room');
const mongoose = require('mongoose');

/**
 * Remove users from a room (creator only)
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 */
exports.removeUsersFromRoom = async (req, res) => {
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
    
    // Find room
    const room = await Room.findById(roomId);
    if (!room) {
      return res.status(404).json({
        success: false,
        message: 'Room not found',
        data: null
      });
    }
    
    // Check permission - only creator can remove users
    if (room.creator.toString() !== req.user._id.toString()) {
      return res.status(403).json({
        success: false,
        message: 'Permission denied: Only the creator can remove users from this room',
        data: null
      });
    }
    
    // Ensure creator isn't removing themselves
    if (validUserIds.includes(room.creator.toString())) {
      return res.status(400).json({
        success: false,
        message: 'Cannot remove the room creator',
        data: null
      });
    }
    
    // Convert existing users to strings for comparison
    const existingUsers = room.users.map(id => id.toString());
    
    // Find users that are actually in the room
    const usersToRemove = validUserIds.filter(id => existingUsers.includes(id));
    
    // Check if there are any users to remove
    if (usersToRemove.length === 0) {
      return res.status(200).json({
        success: true,
        message: 'None of the specified users are in the room',
        data: {
          room,
          removedUsers: []
        }
      });
    }
    
    // Remove users from room
    room.users = room.users.filter(userId => 
      !usersToRemove.includes(userId.toString())
    );
    
    // Save updated room
    const updatedRoom = await room.save();
    
    // Return success response with removed users info
    return res.status(200).json({
      success: true,
      message: 'Users removed from room successfully',
      data: {
        room: updatedRoom,
        removedUsers: usersToRemove,
        removedCount: usersToRemove.length,
        remainingUsers: updatedRoom.users.length
      }
    });
    
  } catch (error) {
    console.error('Error removing users from room:', error);
    return res.status(500).json({
      success: false,
      message: 'Server error while removing users from room',
      error: process.env.NODE_ENV === 'production' ? 'Internal server error' : error.message
    });
  }
};