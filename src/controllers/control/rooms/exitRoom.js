const Room = require('../../../models/Room');
const Device = require('../../../models/Device');
const mongoose = require('mongoose');

/**
 * Exit room (user removes themselves from a room)
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 */
exports.exitRoom = async (req, res) => {
  try {
    const roomId = req.params.roomId;
    const userId = req.user._id;
    
    // Validate room ID
    if (!mongoose.Types.ObjectId.isValid(roomId)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid room ID format',
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
    
    // Check if user is the creator - creators can't exit their own rooms
    if (room.creator.toString() === userId.toString()) {
      return res.status(400).json({
        success: false,
        message: 'Room creator cannot exit their own room. Consider deleting the room instead.',
        data: null
      });
    }
    
    // Check if user is in the room
    const userIndex = room.users.findIndex(id => id.toString() === userId.toString());
    if (userIndex === -1) {
      return res.status(400).json({
        success: false,
        message: 'You are not a member of this room',
        data: null
      });
    }
    
    // Remove user from the room
    room.users.splice(userIndex, 1);
    
    // Remove user from all devices in this room
    const devices = await Device.find({ room: roomId });
    for (const device of devices) {
      device.users = device.users.filter(user => !user.equals(userId));
      await device.save();
    }
    
    // Save updated room
    const updatedRoom = await room.save();
    
    // Return success response
    return res.status(200).json({
      success: true,
      message: 'You have successfully left the room and been removed from all associated devices',
      data: {
        roomId: updatedRoom._id,
        roomName: updatedRoom.name,
        remainingUsers: updatedRoom.users.length
      }
    });
    
  } catch (error) {
    console.error('Error exiting room:', error);
    return res.status(500).json({
      success: false,
      message: 'Server error while exiting room',
      error: process.env.NODE_ENV === 'production' ? 'Internal server error' : error.message
    });
  }
};