const Device = require('../../models/Device');
const { normalizeState } = require('../../websockets/utils/stateUtils');

class RoomHandler {
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
   * Handle room state messages
   * @param {String} roomId - Room identifier
   * @param {Object} payload - Message payload containing device updates
   */
  async handleRoomStateMessage(roomId, payload) {
    try {
      if (!payload.updates || !Array.isArray(payload.updates)) {
        return console.error('Invalid room state update format');
      }
      
      const updatedDevices = [];
      
      // Process each device update
      for (const update of payload.updates) {
        const deviceUpdate = await this._processDeviceUpdate(roomId, update);
        if (deviceUpdate) {
          updatedDevices.push(deviceUpdate);
        }
      }
      
      // Notify all relevant parties about the updates
      if (updatedDevices.length > 0) {
        this._notifyClients(roomId, updatedDevices);
        this.publisher.publishEspRoomStateUpdate(roomId, updatedDevices);
      }
      
      console.log(`Updated ${updatedDevices.length} devices in room ${roomId} via MQTT`);
    } catch (error) {
      console.error('Error handling room state message:', error);
    }
  }

  /**
   * Process individual device update within a room
   * @param {String} roomId - Room identifier
   * @param {Object} update - Device update object
   * @returns {Object|null} Processed device update or null if failed
   * @private
   */
  async _processDeviceUpdate(roomId, update) {
    if (!update.deviceId || update.state === undefined) {
      return null;
    }
    
    try {
      // Find the device and make sure it's in the correct room
      const device = await Device.findOne({
        _id: update.deviceId,
        room: roomId
      });
      
      if (!device) {
        console.warn(`Device ${update.deviceId} not found in room ${roomId}`);
        return null;
      }
      
      // Update device state
      const newState = normalizeState(update.state);
      device.status = newState;
      await device.save();
      
      return {
        deviceId: device._id,
        state: newState,
        order: device.order
      };
    } catch (deviceError) {
      console.error(`Error updating device ${update.deviceId}:`, deviceError);
      return null;
    }
  }

  /**
   * Notify WebSocket clients of room device updates
   * @param {String} roomId - Room identifier
   * @param {Array} updatedDevices - Array of updated device objects
   * @private
   */
  _notifyClients(roomId, updatedDevices) {
    // Notify individual devices
    updatedDevices.forEach(device => {
      this.io.of('/ws/user').to(`device:${device.deviceId}`).emit('state-updated', {
        deviceId: device.deviceId,
        state: device.state,
        updatedBy: 'mqtt'
      });
    });
    
    // Notify room-user namespace about bulk updates
    this.io.of('/ws/room-user').to(`room:${roomId}`).emit('room-devices-updated', {
      roomId: roomId,
      updates: updatedDevices.map(d => ({ 
        deviceId: d.deviceId, 
        state: d.state 
      })),
      updatedBy: 'mqtt'
    });
  }
}

module.exports = RoomHandler;