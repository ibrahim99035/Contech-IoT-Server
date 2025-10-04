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
      
      const device = await Device.findById(data.deviceId).populate('room');
      
      if (!device) {
        return socket.emit('error', { message: 'Device not found' });
      }
      
      // Access check
      if (!device.users.includes(socket.user._id) && !device.creator.equals(socket.user._id)) {
        return socket.emit('error', { message: 'Access denied to the device' });
      }
      
      // Normalize state to string format
      const newState = normalizeState(data.state);
      
      // Update device state in database FIRST
      device.status = newState;
      await device.save();
      
      // Notify WebSocket clients immediately (so user gets instant feedback)
      io.of('/ws/user').to(`device:${device._id}`).emit('state-updated', { 
        deviceId: device._id, 
        state: newState,
        updatedBy: 'user',
        userId: socket.user._id.toString(),
        roomId: device.room,
        espConnected: device.room.esp_component_connected
      });
      
      // Notify the device namespace
      io.of('/ws/device').to(`device:${device._id}`).emit('state-update', { 
        deviceId: device._id, 
        state: newState,
        updatedBy: 'user',
        userId: socket.user._id
      });
      
      // Publish to MQTT (this will echo back and trigger ESP notification in handleDeviceStateMessage)
      mqttBroker.publishDeviceState(device._id, newState, {
        updatedBy: 'user',
        userId: socket.user._id.toString()
      });
      
      console.log(`Device ${device.name} state updated to ${newState} by user ${socket.user.name}`);
    } catch (error) {
      console.error('Error updating device state:', error);
      socket.emit('error', { message: 'Failed to update device state', error: error.message });
    }
  });
  
  // Register MQTT specific handlers
  mqttHandlers.registerHandlers(io, socket);

  // Handle device info requests with ESP status
  socket.on('get-device-info', async (data) => {
    try {
      if (!data || !data.deviceId) {
        return socket.emit('error', { message: 'Device ID is required' });
      }
      
      const Room = require('../../models/Room');
      
      const device = await Device.findById(data.deviceId).populate('room');
      if (!device) {
        return socket.emit('error', { message: 'Device not found' });
      }
      
      // Access check
      if (!device.users.includes(socket.user._id) && !device.creator.equals(socket.user._id)) {
        return socket.emit('error', { message: 'Access denied to device' });
      }
      
      socket.emit('device-info', {
        device: {
          id: device._id,
          name: device.name,
          type: device.type,
          status: device.status,
          room: {
            id: device.room._id,
            name: device.room.name,
            espConnected: device.room.esp_component_connected
          }
        }
      });
      
    } catch (error) {
      console.error('Error getting device info:', error);
      socket.emit('error', { message: 'Failed to get device info' });
    }
  });
}

module.exports = {
  registerHandlers
};