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
    
    // Disconnect handler
    socket.on('disconnect', () => {
      console.log(`User disconnected: ${socket.id} (${socket.user.name})`);
    });
  });
};