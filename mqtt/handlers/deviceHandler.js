const Device = require('../../models/Device');
const { normalizeState } = require('../../websockets/utils/stateUtils');

class DeviceHandler {
  constructor(espMappingManager) {
    this.espMappingManager = espMappingManager;
    this.io = null;
    this.publisher = null;
  }

  initialize(io, publisher) {
    this.io = io;
    this.publisher = publisher;
  }

  /**
   * Handle device state messages (including forwarding to ESP)
   * @param {String} deviceId - Device identifier
   * @param {Object} payload - Message payload
   */
  async handleDeviceStateMessage(deviceId, payload) {
    try {
      // Find the device
      const device = await Device.findById(deviceId);
      
      if (!device) {
        return console.error(`Device not found: ${deviceId}`);
      }
      
      // Update device state in DB
      const newState = normalizeState(payload.state);
      device.status = newState;
      await device.save();
      
      // Propagate the state change to WebSocket clients
      this._notifyWebSocketClients(deviceId, newState, device.room);
      
      // Notify ESP devices in this room if applicable
      if (device.room) {
        this.publisher.publishEspStateUpdate(device.room.toString(), deviceId, newState, device.order);
      }
      
      console.log(`Device ${device.name} state updated via MQTT to ${newState}`);
    } catch (error) {
      console.error('Error handling device state message:', error);
    }
  }

  /**
   * Handle device status messages (online/offline)
   * @param {String} deviceId - Device identifier
   * @param {Object} payload - Message payload
   */
  async handleDeviceStatusMessage(deviceId, payload) {
    try {
      // Find the device
      const device = await Device.findById(deviceId);
      
      if (!device) {
        return console.error(`Device not found: ${deviceId}`);
      }
      
      // Update device connection status
      const isOnline = payload.status === 'online';
      device.isOnline = isOnline;
      await device.save();
      
      // Notify WebSocket clients
      this._notifyDeviceStatus(deviceId, isOnline);
      
      console.log(`Device ${device.name} connection status updated via MQTT: ${isOnline ? 'online' : 'offline'}`);
    } catch (error) {
      console.error('Error handling device status message:', error);
    }
  }

  /**
   * Notify WebSocket clients of device state changes
   * @private
   */
  _notifyWebSocketClients(deviceId, newState, roomId) {
    // Notify individual device subscribers
    this.io.of('/ws/user').to(`device:${deviceId}`).emit('state-updated', {
      deviceId: deviceId,
      state: newState,
      updatedBy: 'mqtt'
    });
    
    // Also notify room users if the device belongs to a room
    if (roomId) {
      this.io.of('/ws/room-user').to(`room:${roomId}`).emit('room-devices-updated', {
        roomId: roomId,
        updates: [{
          deviceId: deviceId,
          state: newState
        }],
        updatedBy: 'mqtt'
      });
    }
  }

  /**
   * Notify WebSocket clients of device status changes
   * @private
   */
  _notifyDeviceStatus(deviceId, isOnline) {
    this.io.of('/ws/user').to(`device:${deviceId}`).emit('device-status', {
      deviceId: deviceId,
      isOnline: isOnline,
      updatedBy: 'mqtt'
    });
  }
}

module.exports = DeviceHandler;