// websockets/handlers/roomEspHandlers.js
const Device = require('../../models/Device');
const { normalizeState } = require('../utils/stateUtils');

function registerHandlers(io, socket) {
  // Handle fetch all devices in room
  socket.on('fetch-room-devices', async () => {
    try {
      // Find all devices in the room and select only needed fields
      const devices = await Device.find({ 
        room: socket.room._id 
      }).select('_id name status');
      
      // Send back the device list (IDs and states only)
      socket.emit('room-devices', {
        roomId: socket.room._id,
        devices: devices.map(device => ({
          id: device._id,
          status: device.status
        }))
      });
      
      console.log(`ESP ${socket.device.name} fetched all devices in room ${socket.room.name}`);
    } catch (error) {
      console.error('Error fetching room devices:', error);
      socket.emit('error', { message: 'Failed to fetch room devices', error: error.message });
    }
  });

  // Handle bulk update of device states in a room
  socket.on('update-room-devices', async (data) => {
    try {
      if (!data || !data.updates || !Array.isArray(data.updates)) {
        return socket.emit('error', { message: 'Invalid updates format' });
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
          // Find the device and make sure it's in the same room
          const device = await Device.findOne({ 
            _id: update.deviceId, 
            room: socket.room._id 
          });
          
          if (!device) {
            results.push({ deviceId: update.deviceId, success: false, message: 'Device not found or not in this room' });
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
        // Notify user namespace about individual device updates
        updatedDevices.forEach(device => {
          io.of('/ws/user').to(`device:${device.deviceId}`).emit('state-updated', { 
            deviceId: device.deviceId, 
            state: device.state,
            updatedBy: 'esp'
          });
          
          // Also notify the device itself
          io.of('/ws/device').to(`device:${device.deviceId}`).emit('state-update', {
            state: device.state,
            updatedBy: 'esp'
          });
        });
        
        // Notify room-user namespace about bulk updates
        io.of('/ws/room-user').to(`room:${socket.room._id}`).emit('room-devices-updated', {
          roomId: socket.room._id,
          updates: updatedDevices,
          updatedBy: 'esp'
        });
      }
      
      // Respond with results
      socket.emit('room-update-results', { results });
      
      console.log(`ESP ${socket.device.name} updated ${updatedDevices.length} devices in room ${socket.room.name}`);
    } catch (error) {
      console.error('Error updating room devices:', error);
      socket.emit('error', { message: 'Failed to update room devices', error: error.message });
    }
  });
}

module.exports = {
  registerHandlers
};