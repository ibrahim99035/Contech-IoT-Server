const Device = require('../../models/Device');
const Room = require('../../models/Room');
const { normalizeState } = require('../../websockets/utils/stateUtils');

class EspHandler {
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
   * Handle ESP authentication requests
   * ESP sends: { roomId: "...", roomPassword: "..." }
   * @param {String} espId - ESP device identifier
   * @param {Object} payload - Authentication payload
   */
  async handleEspAuthMessage(espId, payload) {
    try {
      const { roomId, roomPassword } = payload;
      
      if (!roomId) {
        return this.publisher.publishEspAuthResponse(espId, {
          success: false,
          error: 'Room ID is required'
        });
      }
      
      // Find room
      const room = await Room.findById(roomId);
      if (!room) {
        return this.publisher.publishEspAuthResponse(espId, {
          success: false,
          error: 'Room not found'
        });
      }
      
      // Verify room password if required
      const passwordResult = await this._verifyRoomPassword(room, roomPassword);
      if (!passwordResult.success) {
        return this.publisher.publishEspAuthResponse(espId, passwordResult);
      }
      
      // Get all devices in the room for ESP reference
      const devices = await Device.find({ room: roomId }).sort({ order: 1 });
      
      // Store ESP-room mapping and update connection status
      await this._establishEspConnection(espId, room, devices);
      
      // Subscribe ESP to room-specific state updates
      this._subscribeEspToRoom(espId, roomId);
      
      // Send successful authentication response
      this.publisher.publishEspAuthResponse(espId, {
        success: true,
        roomId: roomId,
        roomName: room.name,
        availableDevices: devices.map(device => ({
          order: device.order,
          deviceId: device._id.toString(),
          deviceName: device.name,
          currentState: device.status
        }))
      });
      
      console.log(`ESP ${espId} authenticated for room ${room.name} with ${devices.length} available devices`);
      
    } catch (error) {
      console.error('Error handling ESP auth:', error);
      this.publisher.publishEspAuthResponse(espId, {
        success: false,
        error: 'Server error during authentication'
      });
    }
  }

  /**
   * Handle ESP compact state messages
   * ESP sends compact state as raw string: "21" (device order 2, state on)
   * @param {String} espId - ESP device identifier  
   * @param {String} compactMessage - Raw compact message
   * @param {Object} payload - Parsed payload (might contain additional data)
   */
  async handleEspCompactStateMessage(espId, compactMessage, payload) {
    try {
      // Extract compact state from payload or use raw message
      const compactState = payload.compactState || compactMessage.trim();
      
      console.log(`ESP ${espId} compact state: ${compactState}`);
      
      // Validate compact state format
      const validation = this._validateCompactState(compactState);
      if (!validation.success) {
        return this.publisher.publishEspCompactResponse(espId, validation);
      }
      
      const { deviceOrder, stateIndicator } = validation.data;
      
      // Get room ID from ESP mapping
      const espMapping = this.espMappingManager.getMapping(espId);
      if (!espMapping) {
        return this.publisher.publishEspCompactResponse(espId, {
          success: false,
          error: 'ESP not authenticated. Please authenticate first.'
        });
      }
      
      // Process the state update
      const result = await this._processCompactStateUpdate(
        espMapping.roomId, 
        deviceOrder, 
        stateIndicator
      );
      
      if (!result.success) {
        return this.publisher.publishEspCompactResponse(espId, result);
      }
      
      // Notify WebSocket clients
      this._notifyStateUpdate(result.device, stateIndicator === '1' ? 'on' : 'off');
      
      // Respond to ESP
      this.publisher.publishEspCompactResponse(espId, {
        success: true,
        deviceOrder: deviceOrder,
        newState: result.device.status,
        deviceName: result.device.name,
        deviceId: result.device._id.toString()
      });
      
      console.log(`ESP compact update: Device ${result.device.name} (Order: ${deviceOrder}) -> ${result.device.status}`);
      
    } catch (error) {
      console.error('Error handling ESP compact state:', error);
      this.publisher.publishEspCompactResponse(espId, {
        success: false,
        error: 'Server error processing compact state'
      });
    }
  }

  /**
   * Handle ESP disconnection cleanup
   * @param {String} espId - ESP device identifier
   */
  async handleEspDisconnection(espId) {
    try {
      const espMapping = this.espMappingManager.getMapping(espId);
      if (!espMapping) return;
      
      const roomId = espMapping.roomId;
      
      // Remove ESP from room connections
      this.espMappingManager.removeRoomConnection(roomId, espId);
      
      // Check if any ESPs are still connected to this room
      const hasConnectedEsps = this.espMappingManager.hasRoomConnections(roomId);
      
      // Update room status if no more ESPs connected
      if (!hasConnectedEsps) {
        await this._updateRoomEspStatus(roomId, false);
      }
      
      // Clean up ESP mapping
      this.espMappingManager.removeMapping(espId);
      
      console.log(`ESP ${espId} disconnected from room ${roomId}`);
    } catch (error) {
      console.error('Error handling ESP disconnection:', error);
    }
  }

  /**
   * Verify room password if required
   * @param {Object} room - Room object
   * @param {String} roomPassword - Provided password
   * @returns {Object} Verification result
   * @private
   */
  async _verifyRoomPassword(room, roomPassword) {
    if (!room.roomPassword) {
      return { success: true };
    }
    
    if (!roomPassword) {
      return {
        success: false,
        error: 'Room password required'
      };
    }
    
    const isMatch = await room.matchRoomPassword(roomPassword);
    if (!isMatch) {
      return {
        success: false,
        error: 'Invalid room password'
      };
    }
    
    return { success: true };
  }

  /**
   * Establish ESP connection and update mappings
   * @private
   */
  async _establishEspConnection(espId, room, devices) {
    // Store ESP-room mapping
    this.espMappingManager.setMapping(espId, {
      roomId: room._id.toString(),
      roomName: room.name,
      authenticatedAt: new Date(),
      devices: devices.map(d => ({
        order: d.order,
        deviceId: d._id.toString(),
        deviceName: d.name,
        currentState: d.status
      }))
    });

    // Add to room connections
    this.espMappingManager.addRoomConnection(room._id.toString(), espId);

    // Update room's ESP connection status and notify users
    await this._updateRoomEspStatus(room._id.toString(), true);
  }

  /**
   * Validate compact state format
   * @param {String} compactState - Compact state string
   * @returns {Object} Validation result
   * @private
   */
  _validateCompactState(compactState) {
    if (typeof compactState !== 'string' || compactState.length !== 2) {
      return {
        success: false,
        error: 'Compact state must be exactly 2 digits'
      };
    }
    
    const deviceOrder = parseInt(compactState[0], 10);
    const stateIndicator = compactState[1];
    
    if (isNaN(deviceOrder) || deviceOrder < 1 || deviceOrder > 6) {
      return {
        success: false,
        error: 'Invalid device order (must be 1-6)'
      };
    }
    
    if (stateIndicator !== '0' && stateIndicator !== '1') {
      return {
        success: false,
        error: 'Invalid state indicator (must be 0 or 1)'
      };
    }
    
    return {
      success: true,
      data: { deviceOrder, stateIndicator }
    };
  }

  /**
   * Process compact state update for a device
   * @private
   */
  async _processCompactStateUpdate(roomId, deviceOrder, stateIndicator) {
    // Find device by order in the specified room
    const device = await Device.findOne({ 
      room: roomId, 
      order: deviceOrder 
    });
    
    if (!device) {
      return {
        success: false,
        error: `No device found at order ${deviceOrder} in room`
      };
    }
    
    const newState = stateIndicator === '1' ? 'on' : 'off';
    const normalizedState = normalizeState(newState);
    
    // Update device in database
    device.status = normalizedState;
    await device.save();
    
    return {
      success: true,
      device: device
    };
  }

  /**
   * Notify WebSocket clients of state updates
   * @private
   */
  _notifyStateUpdate(device, newState) {
    const normalizedState = normalizeState(newState);
    
    this.io.of('/ws/user').to(`device:${device._id}`).emit('state-updated', {
      deviceId: device._id.toString(),
      state: normalizedState,
      updatedBy: 'esp-compact'
    });
    
    if (device.room) {
      this.io.of('/ws/room-user').to(`room:${device.room}`).emit('room-devices-updated', {
        roomId: device.room.toString(),
        updates: [{ deviceId: device._id.toString(), state: normalizedState }],
        updatedBy: 'esp-compact'
      });
    }
  }

  /**
   * Subscribe ESP to room-specific topics for receiving state updates
   * @private
   */
  _subscribeEspToRoom(espId, roomId) {
    console.log(`ESP ${espId} should subscribe to:`);
    console.log(`- home-automation/esp/room/${roomId}/state-update`);
    console.log(`- home-automation/esp/room/${roomId}/bulk-update`);
    console.log(`- home-automation/esp/room/${roomId}/task-update`);
  }

  /**
   * Update room ESP connection status and notify users
   * @private
   */
  async _updateRoomEspStatus(roomId, isConnected) {
    try {
      // Update room in database
      await Room.findByIdAndUpdate(roomId, { 
        esp_component_connected: isConnected 
      });
      
      // Notify users via WebSocket
      if (this.io && this.io.of('/ws/room-user')) {
        this.io.of('/ws/room-user').to(`room:${roomId}`).emit('room-esp-status-updated', {
          roomId: roomId,
          espConnected: isConnected,
          timestamp: new Date()
        });
      }
      
      console.log(`Room ${roomId} ESP connection status updated: ${isConnected}`);
    } catch (error) {
      console.error('Error updating room ESP status:', error);
    }
  }
}

module.exports = EspHandler;