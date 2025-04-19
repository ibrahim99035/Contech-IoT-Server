const Room = require('../../../models/Room');
const mongoose = require('mongoose');

/**
 * Add users to a room
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 */
exports.addUsersToRoom = async (req, res) => {
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
    
    // Check permission
    if (room.creator.toString() !== req.user._id.toString()) {
      return res.status(403).json({
        success: false,
        message: 'Permission denied: Only the creator can add users to this room',
        data: null
      });
    }
    
    // Remove creator from the list (if included)
    const filteredUserIds = validUserIds.filter(id => 
      id !== req.user._id.toString()
    );
    
    // Check if any users remain to be added after filtering
    if (filteredUserIds.length === 0) {
      return res.status(400).json({
        success: false,
        message: 'No valid users to add (creator cannot be added as a user)',
        data: null
      });
    }
    
    // Convert existing users to strings for comparison
    const existingUsers = room.users.map(id => id.toString());
    
    // Find new users that aren't already in the room
    const newUsers = filteredUserIds.filter(id => !existingUsers.includes(id));
    
    // Check if there are any new users to add
    if (newUsers.length === 0) {
      return res.status(200).json({
        success: true,
        message: 'All valid users are already in the room',
        data: {
          room,
          addedUsers: []
        }
      });
    }
    
    // Add new users to room
    room.users = [...existingUsers, ...newUsers];
    
    // Save updated room
    const updatedRoom = await room.save();
    
    // Return success response with added users info
    return res.status(200).json({
      success: true,
      message: 'Users added to room successfully',
      data: {
        room: updatedRoom,
        addedUsers: newUsers,
        addedCount: newUsers.length,
        totalUsers: updatedRoom.users.length
      }
    });
    
  } catch (error) {
    console.error('Error adding users to room:', error);
    return res.status(500).json({
      success: false,
      message: 'Server error while adding users to room',
      error: process.env.NODE_ENV === 'production' ? 'Internal server error' : error.message
    });
  }
};