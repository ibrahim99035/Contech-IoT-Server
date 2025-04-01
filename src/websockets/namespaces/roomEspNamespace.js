const crypto = require('crypto');
const Device = require('../../models/Device');
const Room = require('../../models/Room');
const roomEspHandlers = require('../handlers/roomEspHandlers');

module.exports = (io) => {
  const roomEspNamespace = io.of('/ws/room-esp');
  
  // Middleware for Room ESP namespace - similar to device namespace but with room context
  roomEspNamespace.use(async (socket, next) => {
    if (socket.handshake.query && socket.handshake.query.componentNumber) {
      try {
        // Hash the component number to match storage format
        const hashedComponentNumber = crypto
          .createHash('sha256')
          .update(socket.handshake.query.componentNumber.trim())
          .digest('hex');
        
        // Find the device using the hashed component number
        const device = await Device.findOne({ 
          componentNumber: hashedComponentNumber 
        });
        
        if (!device) {
          return next(new Error('Authentication failed: Device not found'));
        }
        
        // Find the room this device belongs to
        const room = await Room.findById(device.room);
        
        if (!room) {
          return next(new Error('Authentication failed: Room not found'));
        }
        
        // Store both device and its room in socket
        socket.device = device;
        socket.room = room;
        next();
      } catch (error) {
        console.error('Room ESP authentication error:', error);
        next(new Error('Authentication failed: Database error'));
      }
    } else {
      next(new Error('Authentication failed: No component number provided'));
    }
  });

  // Connection handler
  roomEspNamespace.on('connection', (socket) => {
    console.log(`ESP connected to room namespace: ${socket.id} (Device: ${socket.device.name}, Room: ${socket.room.name})`);
    
    // Join room-specific socket rooms
    socket.join(`room:${socket.room._id}`);
    
    // Register event handlers
    roomEspHandlers.registerHandlers(io, socket);
    
    socket.on('disconnect', () => {
      console.log(`ESP disconnected from room namespace: ${socket.id} (Device: ${socket.device.name}, Room: ${socket.room.name})`);
    });
  });
};