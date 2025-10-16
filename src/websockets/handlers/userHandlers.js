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
      
      if (!device.users.includes(socket.user._id) && !device.creator.equals(socket.user._id)) {
        return socket.emit('error', { message: 'Access denied to the device' });
      }
      
      const newState = normalizeState(data.state);
      device.status = newState;
      await device.save();
      
      io.of('/ws/device').to(`device:${device._id}`).emit('state-update', { 
        deviceId: device._id, 
        state: newState,
        updatedBy: 'user',
        userId: socket.user._id
      });
      
      mqttBroker.publishDeviceState(device._id, newState, {
        updatedBy: 'user',
        userId: socket.user._id.toString()
      });
      
      // ✅ FIX: Get real-time ESP status from memory, not database
      const roomId = device.room._id.toString();
      const actualEspStatus = mqttBroker.roomEspConnections.has(roomId) && 
                            mqttBroker.roomEspConnections.get(roomId).size > 0;
      
      io.of('/ws/user').to(`device:${device._id}`).emit('state-updated', { 
        deviceId: device._id.toString(), 
        state: newState,
        updatedBy: 'user',
        userId: socket.user._id.toString(),
        roomId: roomId,  
        espConnected: actualEspStatus
      });
      
      console.log(`Device ${device.name} updated to ${newState}, ESP: ${actualEspStatus}`);
    } catch (error) {
      console.error('Error updating device state:', error);
      socket.emit('error', { message: 'Failed to update device state', error: error.message });
    }
  });
  
  // Register MQTT specific handlers
  mqttHandlers.registerHandlers(io, socket);

  // - Handle device info requests with ESP status:
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
      
      if (!device.users.includes(socket.user._id) && !device.creator.equals(socket.user._id)) {
        return socket.emit('error', { message: 'Access denied to device' });
      }
      
      const roomId = device.room._id.toString();
      const actualEspStatus = mqttBroker.roomEspConnections.has(roomId) && 
                            mqttBroker.roomEspConnections.get(roomId).size > 0;
      
      socket.emit('device-info', {
        device: {
          id: device._id,
          name: device.name,
          type: device.type,
          status: device.status,
          room: {
            id: device.room._id,
            name: device.room.name,
            espConnected: actualEspStatus
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