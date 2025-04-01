const Room = require('../../models/Room');

/**
 * Joins a user socket to rooms for all rooms they have access to
 * @param {Object} io - Socket.IO instance
 * @param {Object} socket - Socket instance with user property
 */
async function joinUserRooms(io, socket) {
  try {
    // Find all rooms this user has access to (either as creator or in users array)
    const rooms = await Room.find({
      $or: [
        { creator: socket.user._id },
        { users: socket.user._id }
      ]
    });
    
    // Join a room for each room
    rooms.forEach(room => {
      socket.join(`room:${room._id}`);
    });
    
    console.log(`User ${socket.user.name} joined ${rooms.length} room channels`);
  } catch (error) {
    console.error('Error joining room channels:', error);
  }
}

/**
 * Checks if a user has access to a specific room
 * @param {Object} room - Room document
 * @param {String} userId - User ID to check
 * @returns {Boolean} - Whether user has access
 */
function checkRoomAccess(room, userId) {
  return room.creator.equals(userId) || room.users.includes(userId);
}

module.exports = {
  joinUserRooms,
  checkRoomAccess
};