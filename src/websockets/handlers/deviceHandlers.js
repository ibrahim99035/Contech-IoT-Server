// websockets/handlers/deviceHandlers.js
const { normalizeState } = require('../utils/stateUtils');

function registerHandlers(io, socket) {
  // Handle state updates from the IoT device
  socket.on('report-state', async (data) => {
    try {
      if (data.state === undefined) {
        return socket.emit('error', { message: 'State value is required' });
      }
      
      // Normalize state to string format
      const newState = normalizeState(data.state);
      
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
}

module.exports = {
  registerHandlers
};