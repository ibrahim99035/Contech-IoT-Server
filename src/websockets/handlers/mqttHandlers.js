const mqttBroker = require('../../mqtt/mqtt-broker');
const { normalizeState } = require('../utils/stateUtils');
const Device = require('../../models/Device');
const Room = require('../../models/Room');

/**
 * Register handlers for MQTT-related actions
 * @param {Object} io - Socket.IO instance
 * @param {Object} socket - Socket instance with user property
 */
function registerHandlers(io, socket) {
  // Handle device state update request via MQTT
  socket.on('update-state-mqtt', async (data) => {
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
      
      // Normalize state
      const newState = normalizeState(data.state);
      
      // Publish to MQTT
      mqttBroker.publishDeviceState(device._id, newState, {
        updatedBy: 'user',
        userId: socket.user._id.toString()
      });
      
      // Respond to the client
      socket.emit('mqtt-state-update-sent', {
        deviceId: device._id,
        state: newState
      });
      
      console.log(`MQTT state update request sent for device ${device.name} by user ${socket.user.name}`);
    } catch (error) {
      console.error('Error updating device state via MQTT:', error);
      socket.emit('error', { message: 'Failed to update device state via MQTT', error: error.message });
    }
  });

  // Handle bulk update of device states in a room via MQTT
  socket.on('update-room-devices-mqtt', async (data) => {
    try {
      if (!data || !data.roomId || !data.updates || !Array.isArray(data.updates)) {
        return socket.emit('error', { message: 'Invalid request format' });
      }
      
      // Find the room and check access
      const room = await Room.findById(data.roomId);
      
      if (!room) {
        return socket.emit('error', { message: 'Room not found' });
      }
      
      // Check user access
      if (!room.users.includes(socket.user._id) && !room.creator.equals(socket.user._id)) {
        return socket.emit('error', { message: 'Access denied to this room' });
      }
      
      // Validate updates
      const validUpdates = [];
      for (const update of data.updates) {
        if (!update.deviceId || update.state === undefined) continue;
        
        // Check if device exists and is in the room
        const device = await Device.findOne({
          _id: update.deviceId,
          room: room._id
        });
        
        if (!device) continue;
        
        // Check user access to the device
        if (!device.users.includes(socket.user._id) && !device.creator.equals(socket.user._id)) {
          continue;
        }
        
        validUpdates.push({
          deviceId: device._id,
          state: normalizeState(update.state)
        });
      }
      
      if (validUpdates.length === 0) {
        return socket.emit('error', { message: 'No valid device updates found' });
      }
      
      // Publish to MQTT
      mqttBroker.publishRoomState(room._id, validUpdates, {
        updatedBy: 'user',
        userId: socket.user._id.toString()
      });
      
      // Respond to the client
      socket.emit('mqtt-room-update-sent', {
        roomId: room._id,
        updatesCount: validUpdates.length
      });
      
      console.log(`MQTT room state update request sent for room ${room.name} with ${validUpdates.length} devices by user ${socket.user.name}`);
    } catch (error) {
      console.error('Error updating room devices via MQTT:', error);
      socket.emit('error', { message: 'Failed to update room devices via MQTT', error: error.message });
    }
  });
}

module.exports = {
  registerHandlers
};