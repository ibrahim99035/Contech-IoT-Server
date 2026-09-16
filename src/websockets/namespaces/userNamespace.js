const jwt = require('jsonwebtoken');
const User = require('../../models/User');
const userHandlers = require('../handlers/userHandlers');
const { joinUserDeviceRooms } = require('../utils/deviceRooms');
const taskHandlers = require('../handlers/taskHandlers');
const logger = require('../../config/logger');

module.exports = (io) => {
  const userNamespace = io.of('/ws/user');

  // Middleware for User namespace — supports auth.token and query.token
  userNamespace.use(async (socket, next) => {
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
  userNamespace.on('connection', (socket) => {
    logger.info(`WebSocket user connected`, { socketId: socket.id, userId: socket.user._id });

    // Join rooms for each device the user has access to
    joinUserDeviceRooms(io, socket);

    // Register event handlers
    userHandlers.registerHandlers(io, socket);

    // Register Task Handlers for user notifications
    taskHandlers.registerTaskHandlers(io, socket);

    // Handle device ESP status requests
    socket.on('get-device-esp-status', async (data) => {
      try {
        if (!data || !data.deviceId) {
          return socket.emit('error', { message: 'Device ID is required' });
        }

        const Device = require('../../models/Device');

        const device = await Device.findById(data.deviceId).populate('room');
        if (!device) {
          return socket.emit('error', { message: 'Device not found' });
        }

        // Access check
        const isUserAccess = device.users.some(u => u.equals(socket.user._id));
        const isCreatorAccess = device.creator.equals(socket.user._id);

        if (!isUserAccess && !isCreatorAccess) {
          return socket.emit('error', { message: 'Access denied to device' });
        }

        socket.emit('device-esp-status-response', {
          deviceId: device._id,
          roomId: device.room?._id,
          roomName: device.room?.name,
          espConnected: device.room ? device.room.esp_component_connected : false,
          timestamp: new Date()
        });

      } catch (error) {
        logger.error('Error getting device ESP status', { error: error.message, socketId: socket.id });
        socket.emit('error', { message: 'Failed to get device ESP status' });
      }
    });

    // Disconnect handler
    socket.on('disconnect', () => {
      logger.info(`WebSocket user disconnected`, { socketId: socket.id, userId: socket.user?._id });
    });
  });
};