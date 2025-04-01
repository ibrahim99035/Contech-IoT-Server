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
    
    socket.on('disconnect', () => {
      console.log(`User disconnected from room namespace: ${socket.id} (${socket.user.name})`);
    });
  });
};