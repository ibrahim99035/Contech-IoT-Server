const jwt = require('jsonwebtoken');
const User = require('../../models/User');
const userHandlers = require('../handlers/userHandlers');
const { joinUserDeviceRooms } = require('../utils/deviceRooms');
const taskHandlers = require('../handlers/taskHandlers');

module.exports = (io) => {
  const userNamespace = io.of('/ws/user');
  
  // Middleware for User namespace
  userNamespace.use(async (socket, next) => {
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
  userNamespace.on('connection', (socket) => {
    console.log(`User connected: ${socket.id} (${socket.user.name})`);
    
    // Join rooms for each device the user has access to
    joinUserDeviceRooms(io, socket);
    
    // Register event handlers
    userHandlers.registerHandlers(io, socket);

    // Register Task Handlers for user notifications
    taskHandlers.registerTaskHandlers(io, socket);

    // Handle device ESP status requests:
    socket.on('get-device-esp-status', async (data) => {
      try {
        if (!data || !data.deviceId) {
          return socket.emit('error', { message: 'Device ID is required' });
        }
        
        const Device = require('../../models/Device');
        const Room = require('../../models/Room');
        
        const device = await Device.findById(data.deviceId).populate('room');
        if (!device) {
          return socket.emit('error', { message: 'Device not found' });
        }
        
        // Access check
        if (!device.users.includes(socket.user._id) && !device.creator.equals(socket.user._id)) {
          return socket.emit('error', { message: 'Access denied to device' });
        }
        
        socket.emit('device-esp-status-response', {
          deviceId: device._id,
          roomId: device.room._id,
          roomName: device.room.name,
          espConnected: device.room.esp_component_connected,
          timestamp: new Date()
        });
        
      } catch (error) {
        console.error('Error getting device ESP status:', error);
        socket.emit('error', { message: 'Failed to get device ESP status' });
      }
    });
    
    // Disconnect handler
    socket.on('disconnect', () => {
      console.log(`User disconnected: ${socket.id} (${socket.user.name})`);
    });
  });
};