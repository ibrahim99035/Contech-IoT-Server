// websockets/handlers/roomUserHandlers.js
const Device = require('../../models/Device');
const Room = require('../../models/Room');
const { normalizeState } = require('../utils/stateUtils');
const { checkRoomAccess } = require('../utils/roomUtils');
const mqttBroker = require('../../mqtt/mqtt-broker');

function registerHandlers(io, socket) {
  // Handle fetch room details with devices
  socket.on('fetch-room', async (data) => {
    try {
      if (!data || !data.roomId) {
        return socket.emit('error', { message: 'Room ID is required' });
      }
      
      // Find the room and check access
      const room = await Room.findById(data.roomId);
      
      if (!room) {
        return socket.emit('error', { message: 'Room not found' });
      }
      
      // Check if user has access to this room
      if (!checkRoomAccess(room, socket.user._id)) {
        return socket.emit('error', { message: 'Access denied to this room' });
      }
      
      // Find all devices in the room with full details
      const devices = await Device.find({ room: room._id });
      
      // Send back the room with devices (full documents)
      socket.emit('room-details', {
        room: {
          id: room._id,
          name: room.name,
          apartment: room.apartment,
          creator: room.creator,
          espConnected: room.esp_component_connected     
        },
        devices: devices.map(device => ({
          id: device._id,
          name: device.name,
          type: device.type,
          status: device.status,
          creator: device.creator
        }))
      });
      
      console.log(`User ${socket.user.name} fetched room ${room.name} with ${devices.length} devices`);
    } catch (error) {
      console.error('Error fetching room details:', error);
      socket.emit('error', { message: 'Failed to fetch room details', error: error.message });
    }
  });

  // Handle bulk update of device states in a room
  socket.on('update-room-devices', async (data) => {
    try {
      if (!data || !data.roomId || !data.updates || !Array.isArray(data.updates)) {
        return socket.emit('error', { message: 'Invalid request format' });
      }
      
      // Find the room and check access
      const room = await Room.findById(data.roomId);
      
      if (!room) {
        return socket.emit('error', { message: 'Room not found' });
      }
      
      // Check if user has access to this room
      if (!checkRoomAccess(room, socket.user._id)) {
        return socket.emit('error', { message: 'Access denied to this room' });
      }
      
      const results = [];
      const updatedDevices = [];
      
      // Process each update
      for (const update of data.updates) {
        if (!update.deviceId || update.state === undefined) {
          results.push({ deviceId: update.deviceId, success: false, message: 'Missing deviceId or state' });
          continue;
        }
        
        try {
          // Find the device and make sure it's in the correct room
          const device = await Device.findOne({ 
            _id: update.deviceId, 
            room: room._id 
          });
          
          if (!device) {
            results.push({ deviceId: update.deviceId, success: false, message: 'Device not found or not in this room' });
            continue;
          }
          
          // Check if user has access to this device
          if (!device.users.includes(socket.user._id) && !device.creator.equals(socket.user._id)) {
            results.push({ deviceId: update.deviceId, success: false, message: 'Access denied to this device' });
            continue;
          }
          
          // Update device state
          const newState = normalizeState(update.state);
          device.status = newState;
          await device.save();
          
          updatedDevices.push({
            deviceId: device._id,
            state: newState
          });
          
          results.push({ deviceId: update.deviceId, success: true, state: newState });
        } catch (deviceError) {
          results.push({ deviceId: update.deviceId, success: false, message: deviceError.message });
        }
      }
      
      // Notify all relevant parties about the updates
      if (updatedDevices.length > 0) {
        // Notify individual devices via device namespace
        updatedDevices.forEach(device => {
          // Notify the specific device
          io.of('/ws/device').to(`device:${device.deviceId}`).emit('state-update', { 
            state: device.state,
            updatedBy: 'user',
            userId: socket.user._id
          });
          
          // Notify users subscribed to the specific device
          io.of('/ws/user').to(`device:${device.deviceId}`).emit('state-updated', { 
            deviceId: device.deviceId, 
            state: device.state,
            updatedBy: 'user',
            userId: socket.user._id
          });
        });
        
        // Notify room-user namespace about bulk updates
        io.of('/ws/room-user').to(`room:${room._id}`).emit('room-devices-updated', {
          roomId: room._id,
          updates: updatedDevices,
          updatedBy: 'user',
          userId: socket.user._id
        });
        
        // Notify room-esp namespace
        io.of('/ws/room-esp').to(`room:${room._id}`).emit('room-state-changed', {
          roomId: room._id,
          updates: updatedDevices
        });
        
        // Publish bulk room state update to MQTT
        mqttBroker.publishRoomState(room._id, updatedDevices, {
          updatedBy: 'user',
          userId: socket.user._id.toString()
        });
      }
      
      // Respond with results
      socket.emit('room-update-results', { results });
      
      console.log(`User ${socket.user.name} updated ${updatedDevices.length} devices in room ${room.name}`);
    } catch (error) {
      console.error('Error updating room devices:', error);
      socket.emit('error', { message: 'Failed to update room devices', error: error.message });
    }
  });
  
  // Get user's rooms with devices
  socket.on('fetch-user-rooms', async () => {
    try {
      // Find all rooms this user has access to
      const rooms = await Room.find({
        $or: [
          { creator: socket.user._id },
          { users: socket.user._id }
        ]
      });
      
      // For each room, get its devices
      const roomsWithDevices = await Promise.all(rooms.map(async (room) => {
        const devices = await Device.find({ room: room._id });
        
        return {
          room: {
            id: room._id,
            name: room.name,
            apartment: room.apartment,
            creator: room.creator,
            espConnected: room.esp_component_connected
          },
          devices: devices.map(device => ({
            id: device._id,
            name: device.name,
            type: device.type,
            status: device.status,
            creator: device.creator
          }))
        };
      }));
      
      socket.emit('user-rooms', { rooms: roomsWithDevices });
      
      console.log(`User ${socket.user.name} fetched ${rooms.length} rooms`);
    } catch (error) {
      console.error('Error fetching user rooms:', error);
      socket.emit('error', { message: 'Failed to fetch user rooms', error: error.message });
    }
  });
}

module.exports = {
  registerHandlers
};