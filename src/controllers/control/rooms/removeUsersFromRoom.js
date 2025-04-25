const Room = require('../../../models/Room');
const Device = require('../../../models/Device');
const mongoose = require('mongoose');

/**
 * Remove users from a room (creator only)
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 */
exports.removeUsersFromRoom = async (req, res) => {
  try {
    // Updated to use roomId parameter instead of id
    const roomId = req.params.roomId;
    let { userIds } = req.body;
    
    console.log('Debug - removeUsersFromRoom request:', {
      roomId: roomId,
      userIds: userIds,
      paramsReceived: req.params,
      requestPath: req.path,
      requestMethod: req.method
    });
    
    // Check if roomId exists
    if (!roomId) {
      return res.status(400).json({
        success: false,
        message: 'Room ID is missing from the request',
        data: null
      });
    }
    
    // Validate room ID format
    if (!mongoose.Types.ObjectId.isValid(roomId)) {
      console.log('Debug - Invalid room ID format:', {
        receivedId: roomId,
        idType: typeof roomId,
        idLength: roomId ? roomId.length : 0
      });
      
      return res.status(400).json({
        success: false,
        message: 'Invalid room ID format',
        data: null
      });
    }
    
    // Validate userIds input
    if (!userIds) {
      return res.status(400).json({
        success: false,
        message: 'userIds is required in the request body',
        data: null
      });
    }
    
    if (!Array.isArray(userIds)) {
      return res.status(400).json({
        success: false,
        message: 'userIds must be an array',
        data: null
      });
    }
    
    if (userIds.length === 0) {
      return res.status(400).json({
        success: false,
        message: 'userIds must not be empty',
        data: null
      });
    }
    
    // Filter valid ObjectIds and remove duplicates
    const validUserIds = [...new Set(
      userIds.filter(id => {
        const isValid = mongoose.Types.ObjectId.isValid(id);
        if (!isValid) {
          console.log('Debug - Invalid user ID:', { invalidId: id });
        }
        return isValid;
      })
    )];
    
    console.log('Debug - Processed user IDs:', {
      originalCount: userIds.length,
      validCount: validUserIds.length,
      validIds: validUserIds
    });
    
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
    
    console.log('Debug - Room found:', {
      roomId: room._id.toString(),
      creatorId: room.creator.toString(),
      requestingUserId: req.user ? req.user._id.toString() : 'No user in request',
      usersCount: room.users.length
    });
    
    // Check if user object exists in request
    if (!req.user || !req.user._id) {
      return res.status(401).json({
        success: false,
        message: 'Authentication required',
        data: null
      });
    }
    
    // Check permission - only creator can remove users
    if (room.creator.toString() !== req.user._id.toString()) {
      console.log('Debug - Permission denied:', {
        roomCreator: room.creator.toString(),
        requestingUser: req.user._id.toString()
      });
      
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
    
    console.log('Debug - Users to remove:', {
      usersInRoom: existingUsers.length,
      usersToRemove: usersToRemove.length
    });
    
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
    
    // Remove users from all devices in this room
    const devices = await Device.find({ room: roomId });
    for (const device of devices) {
      device.users = device.users.filter(user => 
        !usersToRemove.includes(user.toString())
      );
      await device.save();
    }
    
    console.log('Debug - Updated room devices:', {
      devicesCount: devices.length
    });
    
    // Save updated room
    const updatedRoom = await room.save();
    
    console.log('Debug - Room update successful:', {
      roomId: updatedRoom._id.toString(),
      removedCount: usersToRemove.length,
      remainingUsers: updatedRoom.users.length
    });
    
    // Return success response with removed users info
    return res.status(200).json({
      success: true,
      message: 'Users removed from room and associated devices successfully',
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