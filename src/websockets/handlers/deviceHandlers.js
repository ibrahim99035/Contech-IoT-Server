// websockets/handlers/deviceHandlers.js
const { normalizeState } = require('../utils/stateUtils');
const mqttBroker = require('../../mqtt/mqtt-broker');
const logger = require('../../config/logger');

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

      const roomId = socket.device.room ? socket.device.room.toString() : null;
      if (roomId) {
        const updates = [{ deviceId: socket.device._id, state: newState }];

        io.of('/ws/room-user').to(`room:${roomId}`).emit('room-devices-updated', {
          roomId,
          updates,
          updatedBy: 'device'
        });

        io.of('/ws/room-esp').to(`room:${roomId}`).emit('room-state-changed', {
          roomId,
          updates
        });
      }

      // A device report is already applied locally; publish it for MQTT/ESP
      // subscribers without letting the server re-process its own echo.
      mqttBroker.publishDeviceState(socket.device._id, newState, {
        updatedBy: 'device',
        suppressEcho: true
      });
      
      socket.emit('state-reported', { state: newState });
      
      logger.info(`Device ${socket.device.name} reported state: ${newState}`);
    } catch (error) {
      logger.error('Error reporting device state:', error);
      socket.emit('error', { message: 'Failed to report device state', error: error.message });
    }
  });
}

module.exports = {
  registerHandlers
};