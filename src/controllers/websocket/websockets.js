const jwt = require('jsonwebtoken');
const User = require('../../models/User');
const Device = require('../../models/Device');

module.exports = (io) => {
  // For User Connections
  io.of('/ws/user').on('connection', (socket) => {
    console.log('User connected: ', socket.id);

    // Authenticate the user
    socket.on('authenticate', async (data) => {
      try {
        const decoded = jwt.verify(data.token, process.env.JWT_SECRET);
        const user = await User.findById(decoded.id);
        
        if (!user) {
          socket.emit('error', { message: 'User not found or invalid token' });
          return;
        }

        socket.user = user;  // Attach the user to the socket
        console.log(`User ${user.name} authenticated`);

        socket.emit('authenticated', { message: 'Authentication successful' });
      } catch (error) {
        socket.emit('error', { message: 'Authentication failed', error: error.message });
      }
    });

    // Handle state updates from the user
    socket.on('update-state', async (data) => {
      try {
        const device = await Device.findById(data.deviceId);
        
        if (!device || !device.users.includes(socket.user._id)) {
          socket.emit('error', { message: 'Access denied to the device' });
          return;
        }

        // Update device state
        device.status = data.state ? 'on' : 'off';
        await device.save();

        // Notify other users and devices
        io.of('/ws/device').emit('state-update', { deviceId: data.deviceId, state: device.status });
        socket.emit('state-updated', { deviceId: data.deviceId, state: device.status });
      } catch (error) {
        socket.emit('error', { message: 'Failed to update device state', error: error.message });
      }
    });

    socket.on('disconnect', () => {
      console.log(`User disconnected: ${socket.id}`);
    });
  });

  // For IoT Device Connections
  io.of('/ws/device').on('connection', (socket) => {
    console.log('IoT Device connected: ', socket.id);

    // Authenticate the IoT device
    socket.on('authenticate', async (data) => {
      try {
        const device = await Device.findOne({ componentNumber: data.componentNumber });

        if (!device) {
          socket.emit('error', { message: 'Device not found' });
          return;
        }

        socket.device = device;  // Attach the device to the socket
        console.log(`Device ${device.name} authenticated`);

        socket.emit('authenticated', { message: 'Authentication successful' });
      } catch (error) {
        socket.emit('error', { message: 'Authentication failed', error: error.message });
      }
    });

    // Handle state updates from the IoT device
    socket.on('report-state', async (data) => {
      try {
        if (!socket.device) {
          socket.emit('error', { message: 'Device not authenticated' });
          return;
        }

        // Update the device status from the IoT device
        socket.device.status = data.state ? 'on' : 'off';
        await socket.device.save();

        // Notify users that the device state has changed
        io.of('/ws/user').emit('state-update', { deviceId: socket.device._id, state: socket.device.status });
        socket.emit('state-reported', { state: socket.device.status });
      } catch (error) {
        socket.emit('error', { message: 'Failed to report device state', error: error.message });
      }
    });

    socket.on('disconnect', () => {
      console.log(`IoT Device disconnected: ${socket.id}`);
    });
  });
};