const jwt = require('jsonwebtoken');
const User = require('../../models/User');
const Device = require('../../models/Device');
const crypto = require('crypto');

module.exports = (io) => {
  // Middleware for User namespace
  io.of('/ws/user').use(async (socket, next) => {
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

  // For User Connections
  io.of('/ws/user').on('connection', (socket) => {
    console.log(`User connected: ${socket.id} (${socket.user.name})`);
    
    // Join rooms for each device the user has access to
    joinUserDeviceRooms(socket);

    // Handle state updates from the user
    socket.on('update-state', async (data) => {
      try {
        if (!data.deviceId) {
          return socket.emit('error', { message: 'Device ID is required' });
        }
        
        const device = await Device.findById(data.deviceId);
        
        if (!device) {
          return socket.emit('error', { message: 'Device not found' });
        }
        
        // Modified access check
        if (!device.users.includes(socket.user._id) && !device.creator.equals(socket.user._id)) {
          return socket.emit('error', { message: 'Access denied to the device' });
        }
        
        // Normalize state to string format
        const newState = data.state === true || data.state === 'on' ? 'on' : 'off';
        
        // Update device state
        device.status = newState;
        await device.save();
        
        // Notify the specific device
        io.of('/ws/device').to(`device:${device._id}`).emit('state-update', { 
          deviceId: device._id, 
          state: newState,
          updatedBy: 'user',
          userId: socket.user._id
        });
        
        // Notify all users with access to this device
        io.of('/ws/user').to(`device:${device._id}`).emit('state-updated', { 
          deviceId: device._id, 
          state: newState 
        });
        
        console.log(`Device ${device.name} state updated to ${newState} by user ${socket.user.name}`);
      } catch (error) {
        console.error('Error updating device state:', error);
        socket.emit('error', { message: 'Failed to update device state', error: error.message });
      }
    });
    
    socket.on('disconnect', () => {
      console.log(`User disconnected: ${socket.id} (${socket.user.name})`);
    });
  });

  // Middleware for Device namespace
  io.of('/ws/device').use(async (socket, next) => {
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

  // For IoT Device Connections
  io.of('/ws/device').on('connection', (socket) => {
    console.log(`IoT Device connected: ${socket.id} (${socket.device.name})`);
    
    // Join device-specific room
    socket.join(`device:${socket.device._id}`);

    // Handle state updates from the IoT device
    socket.on('report-state', async (data) => {
      try {
        if (data.state === undefined) {
          return socket.emit('error', { message: 'State value is required' });
        }
        
        // Normalize state to string format
        const newState = data.state === true || data.state === 'on' ? 'on' : 'off';
        
        // Update the device status
        socket.device.status = newState;
        await socket.device.save();
        
        // Notify all users with access to this device
        io.of('/ws/user').to(`device:${socket.device._id}`).emit('state-update', { 
          deviceId: socket.device._id, 
          state: newState,
          updatedBy: 'device'
        });
        
        socket.emit('state-reported', { state: newState });
        
        console.log(`Device ${socket.device.name} reported state: ${newState}`);
      } catch (error) {
        console.error('Error reporting device state:', error);
        socket.emit('error', { message: 'Failed to report device state', error: error.message });
      }
    });
    
    socket.on('disconnect', () => {
      console.log(`IoT Device disconnected: ${socket.id} (${socket.device.name})`);
    });
  });

  // Helper function to make user join rooms for all devices they have access to
  async function joinUserDeviceRooms(socket) {
    try {
      // Find all devices this user has access to
      const devices = await Device.find({ users: socket.user._id });
      
      // Join a room for each device
      devices.forEach(device => {
        socket.join(`device:${device._id}`);
      });
      
      console.log(`User ${socket.user.name} joined ${devices.length} device rooms`);
    } catch (error) {
      console.error('Error joining device rooms:', error);
    }
  }
};