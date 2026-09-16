const jwt = require('jsonwebtoken');
const User = require('../../models/User');
const roomUserHandlers = require('../handlers/roomUserHandlers');
const { joinUserRooms } = require('../utils/roomUtils');
const logger = require('../../config/logger');

module.exports = (io) => {
  const roomUserNamespace = io.of('/ws/room-user');

  // Middleware for Room User namespace — supports auth.token and query.token
  roomUserNamespace.use(async (socket, next) => {
    const token = socket.handshake.auth?.token || socket.handshake.query?.token;

    if (!token) {
      return next(new Error('Authentication failed: No token provided'));
    }

    try {
      const decoded = jwt.verify(token, process.env.JWT_SECRET);
      const user = await User.findById(decoded.id).select('-password');

      if (!user) {
        return next(new Error('Authentication failed: User not found'));
      }

      if (!user.active) {
        return next(new Error('Authentication failed: Account deactivated'));
      }

      socket.user = user;
      next();
    } catch (error) {
      next(new Error('Authentication failed: Invalid or expired token'));
    }
  });

  // Connection handler
  roomUserNamespace.on('connection', (socket) => {
    logger.info(`WebSocket user connected to room namespace`, { socketId: socket.id, userId: socket.user._id });

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
        logger.error('Error getting ESP status via socket', { error: error.message, socketId: socket.id });
        socket.emit('error', { message: 'Failed to get ESP status' });
      }
    });

    socket.on('disconnect', () => {
      logger.info(`WebSocket user disconnected from room namespace`, { socketId: socket.id, userId: socket.user?._id });
    });
  });
};