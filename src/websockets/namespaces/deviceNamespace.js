const crypto = require('crypto');
const Device = require('../../models/Device');
const deviceHandlers = require('../handlers/deviceHandlers');
const taskHandlers = require('../handlers/taskHandlers');

module.exports = (io) => {
  const deviceNamespace = io.of('/ws/device');
  
  // Middleware for Device namespace
  deviceNamespace.use(async (socket, next) => {
    if (socket.handshake.query && socket.handshake.query.componentNumber) {
      try {
        // Hash the component number to match storage format
        const hashedComponentNumber = crypto
          .createHash('sha256')
          .update(socket.handshake.query.componentNumber.trim())
          .digest('hex');
        
        const device = await Device.findOne({ 
          componentNumber: hashedComponentNumber 
        });
        
        if (!device) {
          return next(new Error('Authentication failed: Device not found'));
        }
        
        socket.device = device;
        next();
      } catch (error) {
        console.error('Device authentication error:', error);
        next(new Error('Authentication failed: Database error'));
      }
    } else {
      next(new Error('Authentication failed: No component number provided'));
    }
  });

  // Connection handler
  deviceNamespace.on('connection', (socket) => {
    console.log(`IoT Device connected: ${socket.id} (${socket.device.name})`);
    
    // Join device-specific room
    socket.join(`device:${socket.device._id}`);
    
    // Register event handlers
    deviceHandlers.registerHandlers(io, socket);

    // Register Task Handlers for device notifications
    taskHandlers.registerTaskHandlers(io, socket);
    
    // Disconnect handler
    socket.on('disconnect', () => {
      console.log(`IoT Device disconnected: ${socket.id} (${socket.device.name})`);
    });
  });
};