const Device = require('../../models/Device');
const { normalizeState } = require('../utils/stateUtils');
const mqttBroker = require('../../mqtt/mqtt-broker');
const mqttHandlers = require('./mqttHandlers');

function registerHandlers(io, socket) {
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
      
      // Access check
      if (!device.users.includes(socket.user._id) && !device.creator.equals(socket.user._id)) {
        return socket.emit('error', { message: 'Access denied to the device' });
      }
      
      // Normalize state to string format
      const newState = normalizeState(data.state);
      
      // Update device state
      device.status = newState;
      await device.save();
      
      // Notify the specific device via websocket
      io.of('/ws/device').to(`device:${device._id}`).emit('state-update', { 
        deviceId: device._id, 
        state: newState,
        updatedBy: 'user',
        userId: socket.user._id
      });
      
      // publish to MQTT 
      mqttBroker.publishDeviceState(device._id, newState, {
        updatedBy: 'user',
        userId: socket.user._id.toString()
      });
      
    
      // Notify all users with access to this device
      io.of('/ws/user').to(`device:${device._id}`).emit('state-updated', { 
        deviceId: device._id, 
        state: newState,
        updatedBy: 'user',
        userId: socket.user._id.toString() // Or just socket.user._id if clients handle ObjectId
      });
      
      console.log(`Device ${device.name} state updated to ${newState} by user ${socket.user.name}`);
    } catch (error) {
      console.error('Error updating device state:', error);
      socket.emit('error', { message: 'Failed to update device state', error: error.message });
    }
  });
  
  // Register MQTT specific handlers
  mqttHandlers.registerHandlers(io, socket);
}

module.exports = {
  registerHandlers
};