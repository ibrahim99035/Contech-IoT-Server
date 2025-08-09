const Device = require('../../models/Device');
const { normalizeState } = require('../../websockets/utils/stateUtils');

class MQTTPublisher {
  constructor() {
    this.client = null;
  }

  initialize(client) {
    this.client = client;
  }

  /**
   * Check if MQTT client is connected
   * @returns {boolean}
   * @private
   */
  _isConnected() {
    return this.client && this.client.connected;
  }

  /**
   * Publish authentication response to ESP
   * @param {String} espId - ESP device identifier
   * @param {Object} response - Authentication response
   */
  publishEspAuthResponse(espId, response) {
    if (!this._isConnected()) {
      return console.error('MQTT client not connected');
    }
    
    this.client.publish(
      `home-automation/esp/${espId}/auth/response`,
      JSON.stringify(response),
      { qos: 1 }
    );
  }

  /**
   * Publish compact state response to ESP
   * @param {String} espId - ESP device identifier
   * @param {Object} response - Compact state response
   */
  publishEspCompactResponse(espId, response) {
    if (!this._isConnected()) {
      return console.error('MQTT client not connected');
    }
    
    this.client.publish(
      `home-automation/esp/${espId}/compact-state/response`,
      JSON.stringify(response),
      { qos: 1 }
    );
  }

  /**
   * Publish state update to ESP devices in a room
   * This handles bidirectional communication: when users change states, notify ESPs
   * @param {String} roomId - Room identifier
   * @param {String} deviceId - Device identifier
   * @param {String} newState - New device state
   * @param {Number} deviceOrder - Device order in room
   */
  publishEspStateUpdate(roomId, deviceId, newState, deviceOrder) {
    if (!this._isConnected()) {
      return console.error('MQTT client not connected');
    }
    
    const stateUpdate = {
      deviceId: deviceId,
      deviceOrder: deviceOrder,
      state: newState,
      compactState: `${deviceOrder}${newState === 'on' ? '1' : '0'}`, // Compact format for ESP
      timestamp: new Date()
    };
    
    // Publish to room-specific ESP topic
    this.client.publish(
      `home-automation/esp/room/${roomId}/state-update`,
      JSON.stringify(stateUpdate),
      { qos: 1 }
    );
    
    console.log(`Published state update to ESP devices in room ${roomId}: Device ${deviceOrder} -> ${newState}`);
  }

  /**
   * Publish bulk room state updates to ESP devices
   * @param {String} roomId - Room identifier
   * @param {Array} updatedDevices - Array of updated device objects
   */
  publishEspRoomStateUpdate(roomId, updatedDevices) {
    if (!this._isConnected()) {
      return console.error('MQTT client not connected');
    }
    
    const roomUpdate = {
      roomId: roomId,
      updates: updatedDevices.map(d => ({
        deviceId: d.deviceId,
        deviceOrder: d.order,
        state: d.state,
        compactState: `${d.order}${d.state === 'on' ? '1' : '0'}` // Compact format for ESP
      })),
      timestamp: new Date()
    };
    
    this.client.publish(
      `home-automation/esp/room/${roomId}/bulk-update`,
      JSON.stringify(roomUpdate),
      { qos: 1 }
    );
    
    console.log(`Published bulk update to ESP devices in room ${roomId}: ${updatedDevices.length} devices`);
  }

  /**
   * Publish task completion to ESP devices
   * @param {String} roomId - Room identifier
   * @param {Object} taskData - Task data object
   */
  publishEspTaskUpdate(roomId, taskData) {
    if (!this._isConnected()) {
      return console.error('MQTT client not connected');
    }
    
    this.client.publish(
      `home-automation/esp/room/${roomId}/task-update`,
      JSON.stringify({
        taskId: taskData._id,
        deviceId: taskData.device._id,
        deviceOrder: taskData.device.order,
        status: taskData.status,
        message: taskData.message,
        timestamp: new Date()
      }),
      { qos: 1 }
    );
  }

  /**
   * Publish a device state update to MQTT (called when users change states)
   * This ensures ESP devices receive user-initiated state changes
   * @param {String} deviceId - Device identifier
   * @param {String} state - New device state
   * @param {Object} options - Additional options
   */
  async publishDeviceState(deviceId, state, options = {}) {
    if (!this._isConnected()) {
      console.error('MQTT client not connected');
      return;
    }
    
    const payload = {
      state: normalizeState(state),
      timestamp: new Date(),
      ...options
    };
    
    // Publish to device-specific topic
    this.client.publish(
      `home-automation/${deviceId}/state`,
      JSON.stringify(payload),
      { qos: 1, retain: true }
    );
    
    console.log(`Published state ${state} to device ${deviceId} via MQTT`);
    
    // Also notify ESP devices if this device belongs to a room
    try {
      const device = await Device.findById(deviceId);
      if (device && device.room) {
        this.publishEspStateUpdate(device.room.toString(), deviceId, normalizeState(state), device.order);
      }
    } catch (err) {
      console.error('Error finding device for ESP notification:', err);
    }
  }

  /**
   * Publish room devices state update to MQTT
   * @param {String} roomId - Room identifier
   * @param {Array} updates - Array of device updates
   * @param {Object} options - Additional options
   */
  async publishRoomState(roomId, updates, options = {}) {
    if (!this._isConnected()) {
      console.error('MQTT client not connected');
      return;
    }
    
    const payload = {
      updates: updates.map(update => ({
        deviceId: update.deviceId,
        state: normalizeState(update.state)
      })),
      timestamp: new Date(),
      ...options
    };
    
    this.client.publish(
      `home-automation/room/${roomId}/state`,
      JSON.stringify(payload),
      { qos: 1 }
    );
    
    console.log(`Published state updates for ${updates.length} devices in room ${roomId} via MQTT`);
    
    // Also create ESP-friendly updates
    try {
      const devices = await Device.find({ 
        _id: { $in: updates.map(u => u.deviceId) },
        room: roomId 
      });
      
      const espUpdates = devices.map(device => {
        const update = updates.find(u => u.deviceId.toString() === device._id.toString());
        return {
          deviceId: device._id,
          state: normalizeState(update.state),
          order: device.order
        };
      });
      
      if (espUpdates.length > 0) {
        this.publishEspRoomStateUpdate(roomId, espUpdates);
      }
    } catch (err) {
      console.error('Error finding devices for ESP room notification:', err);
    }
  }

  /**
   * Publish task execution notification
   * @param {Object} task - Task object
   */
  publishTaskExecution(task) {
    if (!this._isConnected()) {
      console.error('MQTT client not connected');
      return;
    }

    this.client.publish(
      `home-automation/${task.device._id}/task`, 
      JSON.stringify({
        taskId: task._id,
        status: 'executed',
        message: `Task "${task.name}" was executed.`,
        timestamp: new Date()
      }),
      { qos: 1 }
    );
  }

  /**
   * Publish task failure notification
   * @param {Object} task - Task object
   * @param {String} error - Error message
   */
  publishTaskFailure(task, error) {
    if (!this._isConnected()) {
      console.error('MQTT client not connected');
      return;
    }

    this.client.publish(
      `home-automation/${task.device._id}/task`,
      JSON.stringify({
        taskId: task._id,
        status: 'failed',
        message: `Task "${task.name}" failed: ${error}`,
        timestamp: new Date()
      }),
      { qos: 1 }
    );
  }
}

module.exports = MQTTPublisher;