const jwt = require('jsonwebtoken');
const User = require('../../models/User');
const roomUserHandlers = require('../handlers/roomUserHandlers');
const { joinUserRooms } = require('../utils/roomUtils');

module.exports = (io) => {
  const roomUserNamespace = io.of('/ws/room-user');
  
  // Middleware for Room User namespace - similar to user namespace
  roomUserNamespace.use(async (socket, next) => {
    if (socket.handshake.query && socket.handshake.query.token) {
      try {
        const decoded = jwt.verify(socket.handshake.query.token, process.env.JWT_SECRET);
        const user = await User.findById(decoded.id);
        
        if (!user) {
          return next(new Error('Authentication failed: User not found'));
        }
        
        socket.user = user;
        next();
      } catch (error) {
        next(new Error('Authentication failed: Invalid token'));
      }
    } else {
      next(new Error('Authentication failed: No token provided'));
    }
  });

  // Connection handler
  roomUserNamespace.on('connection', (socket) => {
    console.log(`User connected to room namespace: ${socket.id} (${socket.user.name})`);
    
    // Join rooms for each room the user has access to
    joinUserRooms(io, socket);
    
    // Register event handlers
    roomUserHandlers.registerHandlers(io, socket);

    // Allow users to request current ESP status for their rooms
    socket.on('get-esp-status', async (data) => {
      try {
        if (!data || !data.roomId) {
          return socket.emit('error', { message: 'Room ID is required' });
        }
        
        const Room = require('../../models/Room');
        const { checkRoomAccess } = require('../utils/roomUtils');
        
        const room = await Room.findById(data.roomId);
        if (!room) {
          return socket.emit('error', { message: 'Room not found' });
        }
        
        if (!checkRoomAccess(room, socket.user._id)) {
          return socket.emit('error', { message: 'Access denied to this room' });
        }
        
        socket.emit('esp-status-response', {
          roomId: room._id,
          espConnected: room.esp_component_connected,
          timestamp: new Date()
        });
        
      } catch (error) {
        console.error('Error getting ESP status:', error);
        socket.emit('error', { message: 'Failed to get ESP status' });
      }
    });
    
    socket.on('disconnect', () => {
      console.log(`User disconnected from room namespace: ${socket.id} (${socket.user.name})`);
    });
  });
};