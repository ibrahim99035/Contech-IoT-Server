const mqtt = require('mqtt');
const taskEvents = require('../websockets/taskEventEmitter');
const { normalizeState } = require('../websockets/utils/stateUtils');
const Device = require('../models/Device');
const Room = require('../models/Room');

let client;
let io;

// ESP-Room mapping storage (in production, use Redis or database)
const espRoomMappings = new Map();

// ADD THIS NEW MAP:
const roomEspConnections = new Map();

/**
 * Initialize the MQTT client and connect to the MQTT broker
 * @param {Object} socketIo - Socket.IO instance for broadcasting events
 */
function initialize(socketIo) {
  io = socketIo;
  
  // Connect to MQTT broker
  const brokerUrl = process.env.MQTT_BROKER_URL || 'mqtt://localhost:1883';
  const options = {
    clientId: `home-automation-server-${Math.random().toString(16).substring(2, 10)}`,
    username: process.env.MQTT_USERNAME,
    password: process.env.MQTT_PASSWORD,
    clean: true,
    reconnectPeriod: 5000
  };
  
  client = mqtt.connect(brokerUrl, options);
  
  // Handle connection
  client.on('connect', () => {
    console.log('Connected to MQTT broker');
    
    // Subscribe to device state topics
    client.subscribe('home-automation/+/state', (err) => {
      if (err) {
        console.error('Error subscribing to device state topics:', err);
      } else {
        console.log('Subscribed to device state topics');
      }
    });
    
    // Subscribe to device connection status
    client.subscribe('home-automation/+/status', (err) => {
      if (err) {
        console.error('Error subscribing to device status topics:', err);
      } else {
        console.log('Subscribed to device status topics');
      }
    });
    
    // Subscribe to room state topics
    client.subscribe('home-automation/room/+/state', (err) => {
      if (err) {
        console.error('Error subscribing to room state topics:', err);
      } else {
        console.log('Subscribed to room state topics');
      }
    });

    // Subscribe to ESP compact state updates
    client.subscribe('home-automation/esp/+/compact-state', (err) => {
      if (err) {
        console.error('Error subscribing to ESP compact state topics:', err);
      } else {
        console.log('Subscribed to ESP compact state topics');
      }
    });

    // Subscribe to ESP authentication requests
    client.subscribe('home-automation/esp/+/auth', (err) => {
      if (err) {
        console.error('Error subscribing to ESP auth topics:', err);
      } else {
        console.log('Subscribed to ESP auth topics');
      }
    });
  });
  
  // Handle error
  client.on('error', (err) => {
    console.error('MQTT error:', err);
  });
  
  // Handle reconnect
  client.on('reconnect', () => {
    console.log('Reconnecting to MQTT broker...');
  });
  
  // Handle messages
  client.on('message', handleMqttMessage);
  
  // Register task event handlers
  registerTaskEventHandlers();
}

/**
 * Handle incoming MQTT messages
 * @param {String} topic - MQTT topic
 * @param {Buffer} message - Message payload
 */
async function handleMqttMessage(topic, message) {
  try {
    console.log(`MQTT message received: ${topic} - ${message.toString()}`);
    
    // Parse the message
    let payload;
    try {
      payload = JSON.parse(message.toString());
    } catch (e) {
      // If not JSON, use raw string
      payload = { state: message.toString() };
    }
    
    // Handle different topic patterns
    if (topic.match(/^home-automation\/([^\/]+)\/state$/)) {
      // Device state topic pattern: home-automation/{deviceId}/state
      const deviceId = topic.split('/')[1];
      await handleDeviceStateMessage(deviceId, payload);
    } 
    else if (topic.match(/^home-automation\/([^\/]+)\/status$/)) {
      // Device connection status: home-automation/{deviceId}/status
      const deviceId = topic.split('/')[1];
      await handleDeviceStatusMessage(deviceId, payload);
    }
    else if (topic.match(/^home-automation\/room\/([^\/]+)\/state$/)) {
      // Room state topic pattern: home-automation/room/{roomId}/state
      const roomId = topic.split('/')[2];
      await handleRoomStateMessage(roomId, payload);
    }
    // Handle ESP compact state updates
    else if (topic.match(/^home-automation\/esp\/([^\/]+)\/compact-state$/)) {
      // ESP compact state: home-automation/esp/{espId}/compact-state
      const espId = topic.split('/')[2];
      await handleEspCompactStateMessage(espId, message.toString(), payload);
    }
    // Handle ESP authentication requests
    else if (topic.match(/^home-automation\/esp\/([^\/]+)\/auth$/)) {
      // ESP auth request: home-automation/esp/{espId}/auth
      const espId = topic.split('/')[2];
      await handleEspAuthMessage(espId, payload);
    }
    // Handle ESP Status Toggle
    else if (topic.match(/^home-automation\/esp\/([^\/]+)\/disconnect$/)) {
      // ESP disconnect notification: home-automation/esp/{espId}/disconnect
      const espId = topic.split('/')[2];
      await handleEspDisconnection(espId);
    }
  } catch (error) {
    console.error('Error handling MQTT message:', error);
  }
}

/**
 * Handle ESP authentication requests
 * ESP sends: { roomId: "...", roomPassword: "..." }
 * @param {String} espId - ESP device identifier
 * @param {Object} payload - Authentication payload
 */
async function handleEspAuthMessage(espId, payload) {
  try {
    const { roomId, roomPassword } = payload;
    
    if (!roomId) {
      return publishEspAuthResponse(espId, {
        success: false,
        error: 'Room ID is required'
      });
    }
    
    // Find room
    const room = await Room.findById(roomId);
    if (!room) {
      return publishEspAuthResponse(espId, {
        success: false,
        error: 'Room not found'
      });
    }
    
    // Check room password
    if (room.roomPassword) {
      if (!roomPassword) {
        return publishEspAuthResponse(espId, {
          success: false,
          error: 'Room password required'
        });
      }
      const isMatch = await room.matchRoomPassword(roomPassword);
      if (!isMatch) {
        return publishEspAuthResponse(espId, {
          success: false,
          error: 'Invalid room password'
        });
      }
    }
    
    // Get all devices in the room for ESP reference
    const devices = await Device.find({ room: roomId }).sort({ order: 1 });
    
    // Store ESP-room mapping
    espRoomMappings.set(espId, {
      roomId: roomId,
      roomName: room.name,
      authenticatedAt: new Date(),
      devices: devices.map(d => ({
        order: d.order,
        deviceId: d._id.toString(),
        deviceName: d.name,
        currentState: d.status
      }))
    });

    if (!roomEspConnections.has(roomId)) {
      roomEspConnections.set(roomId, new Set());
    }
    roomEspConnections.get(roomId).add(espId);

    // Update room's ESP connection status and notify users
    await updateRoomEspStatus(roomId, true);
    
    // Subscribe ESP to room-specific state updates
    subscribeEspToRoom(espId, roomId);
    
    // Authentication successful
    publishEspAuthResponse(espId, {
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
    publishEspAuthResponse(espId, {
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
async function handleEspCompactStateMessage(espId, compactMessage, payload) {
  try {
    // Extract compact state from payload or use raw message
    const compactState = payload.compactState || compactMessage.trim();
    
    console.log(`ESP ${espId} compact state: ${compactState}`);
    
    if (typeof compactState !== 'string' || compactState.length !== 2) {
      return publishEspCompactResponse(espId, {
        success: false,
        error: 'Compact state must be exactly 2 digits'
      });
    }
    
    const deviceOrder = parseInt(compactState[0], 10);
    const stateIndicator = compactState[1];
    
    if (isNaN(deviceOrder) || deviceOrder < 1 || deviceOrder > 6) {
      return publishEspCompactResponse(espId, {
        success: false,
        error: 'Invalid device order (must be 1-6)'
      });
    }
    
    if (stateIndicator !== '0' && stateIndicator !== '1') {
      return publishEspCompactResponse(espId, {
        success: false,
        error: 'Invalid state indicator (must be 0 or 1)'
      });
    }
    
    // Get room ID from ESP mapping
    const espMapping = espRoomMappings.get(espId);
    if (!espMapping) {
      return publishEspCompactResponse(espId, {
        success: false,
        error: 'ESP not authenticated. Please authenticate first.'
      });
    }
    
    const roomId = espMapping.roomId;
    
    // Find device by order in the specified room
    const device = await Device.findOne({ 
      room: roomId, 
      order: deviceOrder 
    });
    
    if (!device) {
      return publishEspCompactResponse(espId, {
        success: false,
        error: `No device found at order ${deviceOrder} in room`
      });
    }
    
    const newState = stateIndicator === '1' ? 'on' : 'off';
    const normalizedState = normalizeState(newState);
    
    // Update device in database
    device.status = normalizedState;
    await device.save();
    
    // Notify WebSocket clients
    io.of('/ws/user').to(`device:${device._id}`).emit('state-updated', {
      deviceId: device._id.toString(),
      state: normalizedState,
      updatedBy: 'esp-compact',
      roomId: device.room.toString(),
      espConnected: room.esp_component_connected
    });
    
    if (device.room) {
      io.of('/ws/room-user').to(`room:${device.room}`).emit('room-devices-updated', {
        roomId: device.room.toString(),
        updates: [{ deviceId: device._id.toString(), state: normalizedState }],
        updatedBy: 'esp-compact'
      });
    }
    
    // Respond to ESP
    publishEspCompactResponse(espId, {
      success: true,
      deviceOrder: deviceOrder,
      newState: normalizedState,
      deviceName: device.name,
      deviceId: device._id.toString()
    });
    
    console.log(`ESP compact update: Device ${device.name} (Order: ${deviceOrder}) -> ${normalizedState}`);
    
  } catch (error) {
    console.error('Error handling ESP compact state:', error);
    publishEspCompactResponse(espId, {
      success: false,
      error: 'Server error processing compact state'
    });
  }
}

/**
 * Handle device state messages (including forwarding to ESP)
 */
async function handleDeviceStateMessage(deviceId, payload) {
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
    io.of('/ws/user').to(`device:${deviceId}`).emit('state-updated', {
      deviceId: deviceId,
      state: newState,
      updatedBy: 'mqtt'
    });
    
    // Also notify room users if the device belongs to a room
    if (device.room) {
      io.of('/ws/room-user').to(`room:${device.room}`).emit('room-devices-updated', {
        roomId: device.room,
        updates: [{
          deviceId: deviceId,
          state: newState
        }],
        updatedBy: 'mqtt'
      });
      
      // Notify ESP devices in this room
      publishEspStateUpdate(device.room.toString(), deviceId, newState, device.order);
    }
    
    console.log(`Device ${device.name} state updated via MQTT to ${newState}`);
  } catch (error) {
    console.error('Error handling device state message:', error);
  }
}

/**
 * Handle device status messages (online/offline)
 */
async function handleDeviceStatusMessage(deviceId, payload) {
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
    io.of('/ws/user').to(`device:${deviceId}`).emit('device-status', {
      deviceId: deviceId,
      isOnline: isOnline,
      updatedBy: 'mqtt'
    });
    
    console.log(`Device ${device.name} connection status updated via MQTT: ${isOnline ? 'online' : 'offline'}`);
  } catch (error) {
    console.error('Error handling device status message:', error);
  }
}

/**
 * Handle room state messages
 */
async function handleRoomStateMessage(roomId, payload) {
  try {
    if (!payload.updates || !Array.isArray(payload.updates)) {
      return console.error('Invalid room state update format');
    }
    
    const updatedDevices = [];
    
    // Process each device update
    for (const update of payload.updates) {
      if (!update.deviceId || update.state === undefined) {
        continue;
      }
      
      try {
        // Find the device and make sure it's in the correct room
        const device = await Device.findOne({
          _id: update.deviceId,
          room: roomId
        });
        
        if (!device) {
          continue;
        }
        
        // Update device state
        const newState = normalizeState(update.state);
        device.status = newState;
        await device.save();
        
        updatedDevices.push({
          deviceId: device._id,
          state: newState,
          order: device.order
        });
      } catch (deviceError) {
        console.error(`Error updating device ${update.deviceId}:`, deviceError);
      }
    }
    
    // Notify all relevant parties about the updates
    if (updatedDevices.length > 0) {
      // Notify individual devices
      updatedDevices.forEach(device => {
        io.of('/ws/user').to(`device:${device.deviceId}`).emit('state-updated', {
          deviceId: device.deviceId,
          state: device.state,
          updatedBy: 'mqtt'
        });
      });
      
      // Notify room-user namespace about bulk updates
      io.of('/ws/room-user').to(`room:${roomId}`).emit('room-devices-updated', {
        roomId: roomId,
        updates: updatedDevices.map(d => ({ deviceId: d.deviceId, state: d.state })),
        updatedBy: 'mqtt'
      });
      
      // Notify ESP devices in this room
      publishEspRoomStateUpdate(roomId, updatedDevices);
    }
    
    console.log(`Updated ${updatedDevices.length} devices in room ${roomId} via MQTT`);
  } catch (error) {
    console.error('Error handling room state message:', error);
  }
}

/**
 * Subscribe ESP to room-specific topics for receiving state updates
 */
function subscribeEspToRoom(espId, roomId) {
  if (!client || !client.connected) {
    return console.error('MQTT client not connected');
  }
  
  // ESP will subscribe to these topics to receive state updates
  console.log(`ESP ${espId} should subscribe to:`);
  console.log(`- home-automation/esp/room/${roomId}/state-update`);
  console.log(`- home-automation/esp/room/${roomId}/bulk-update`);
  console.log(`- home-automation/esp/room/${roomId}/task-update`);
}

/**
 * Publish authentication response to ESP
 */
function publishEspAuthResponse(espId, response) {
  if (!client || !client.connected) {
    return console.error('MQTT client not connected');
  }
  
  client.publish(
    `home-automation/esp/${espId}/auth/response`,
    JSON.stringify(response),
    { qos: 1 }
  );
}

/**
 * Publish compact state response to ESP
 */
function publishEspCompactResponse(espId, response) {
  if (!client || !client.connected) {
    return console.error('MQTT client not connected');
  }
  
  client.publish(
    `home-automation/esp/${espId}/compact-state/response`,
    JSON.stringify(response),
    { qos: 1 }
  );
}

/**
 * Publish state update to ESP devices in a room
 * This handles bidirectional communication: when users change states, notify ESPs
 */
function publishEspStateUpdate(roomId, deviceId, newState, deviceOrder) {
  if (!client || !client.connected) {
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
  client.publish(
    `home-automation/esp/room/${roomId}/state-update`,
    JSON.stringify(stateUpdate),
    { qos: 1 }
  );
  
  console.log(`Published state update to ESP devices in room ${roomId}: Device ${deviceOrder} -> ${newState}`);
}

/**
 * Publish bulk room state updates to ESP devices
 */
function publishEspRoomStateUpdate(roomId, updatedDevices) {
  if (!client || !client.connected) {
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
  
  client.publish(
    `home-automation/esp/room/${roomId}/bulk-update`,
    JSON.stringify(roomUpdate),
    { qos: 1 }
  );
  
  console.log(`Published bulk update to ESP devices in room ${roomId}: ${updatedDevices.length} devices`);
}

/**
 * Publish task completion to ESP devices
 */
function publishEspTaskUpdate(roomId, taskData) {
  if (!client || !client.connected) {
    return console.error('MQTT client not connected');
  }
  
  client.publish(
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
 * Register task event handlers to publish updates to MQTT and ESP
 */
function registerTaskEventHandlers() {
  taskEvents.on('task-executed', async (task) => {
    try {
      // Publish task execution to device-specific MQTT topic
      client.publish(
        `home-automation/${task.device._id}/task`, 
        JSON.stringify({
          taskId: task._id,
          status: 'executed',
          message: `Task "${task.name}" was executed.`,
          timestamp: new Date()
        })
      );
      
      // Publish to ESP devices in the room if device has a room
      if (task.device.room) {
        publishEspTaskUpdate(task.device.room.toString(), {
          _id: task._id,
          device: task.device,
          status: 'executed',
          message: `Task "${task.name}" was executed.`
        });
      }
    } catch (error) {
      console.error('Error publishing task execution to MQTT:', error);
    }
  });
  
  taskEvents.on('task-failed', async (task, error) => {
    try {
      // Publish task failure to device-specific MQTT topic
      client.publish(
        `home-automation/${task.device._id}/task`,
        JSON.stringify({
          taskId: task._id,
          status: 'failed',
          message: `Task "${task.name}" failed: ${error}`,
          timestamp: new Date()
        })
      );
      
      // Publish to ESP devices in the room if device has a room
      if (task.device.room) {
        publishEspTaskUpdate(task.device.room.toString(), {
          _id: task._id,
          device: task.device,
          status: 'failed',
          message: `Task "${task.name}" failed: ${error}`
        });
      }
    } catch (err) {
      console.error('Error publishing task failure to MQTT:', err);
    }
  });
}

/**
 * Publish a device state update to MQTT (called when users change states)
 * This ensures ESP devices receive user-initiated state changes
 */
function publishDeviceState(deviceId, state, options = {}) {
  if (!client || !client.connected) {
    console.error('MQTT client not connected');
    return;
  }
  
  const payload = {
    state: normalizeState(state),
    timestamp: new Date(),
    ...options
  };
  
  // Publish to device-specific topic
  client.publish(
    `home-automation/${deviceId}/state`,
    JSON.stringify(payload),
    { qos: 1, retain: true }
  );
  
  console.log(`Published state ${state} to device ${deviceId} via MQTT`);
  
  // Also notify ESP devices if this device belongs to a room
  Device.findById(deviceId).then(device => {
    if (device && device.room) {
      publishEspStateUpdate(device.room.toString(), deviceId, normalizeState(state), device.order);
    }
  }).catch(err => {
    console.error('Error finding device for ESP notification:', err);
  });
}

/**
 * Publish room devices state update to MQTT
 */
function publishRoomState(roomId, updates, options = {}) {
  if (!client || !client.connected) {
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
  
  client.publish(
    `home-automation/room/${roomId}/state`,
    JSON.stringify(payload),
    { qos: 1 }
  );
  
  console.log(`Published state updates for ${updates.length} devices in room ${roomId} via MQTT`);
  
  // Also create ESP-friendly updates
  Device.find({ 
    _id: { $in: updates.map(u => u.deviceId) },
    room: roomId 
  }).then(devices => {
    const espUpdates = devices.map(device => {
      const update = updates.find(u => u.deviceId.toString() === device._id.toString());
      return {
        deviceId: device._id,
        state: normalizeState(update.state),
        order: device.order
      };
    });
    
    if (espUpdates.length > 0) {
      publishEspRoomStateUpdate(roomId, espUpdates);
    }
  }).catch(err => {
    console.error('Error finding devices for ESP room notification:', err);
  });
}

/**
 * Get ESP room mapping (for debugging/monitoring)
 */
function getEspRoomMapping(espId) {
  return espRoomMappings.get(espId);
}

/**
 * Remove ESP room mapping (cleanup)
 */
function removeEspRoomMapping(espId) {
  return espRoomMappings.delete(espId);
}

/**
 * Update room ESP connection status and notify users
 */
async function updateRoomEspStatus(roomId, isConnected) {
  try {
    // Update room in database
    await Room.findByIdAndUpdate(roomId, { 
      esp_component_connected: isConnected 
    });
    
    // Notify users via WebSocket
    if (io && io.of('/ws/room-user')) {
      io.of('/ws/room-user').to(`room:${roomId}`).emit('room-esp-status-updated', {
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

/**
 * Handle ESP disconnection cleanup
 */
async function handleEspDisconnection(espId) {
  try {
    const espMapping = espRoomMappings.get(espId);
    if (!espMapping) return;
    
    const roomId = espMapping.roomId;
    
    // Remove ESP from room connections
    if (roomEspConnections.has(roomId)) {
      roomEspConnections.get(roomId).delete(espId);
      
      // If no more ESPs connected to this room, update status
      if (roomEspConnections.get(roomId).size === 0) {
        roomEspConnections.delete(roomId);
        await updateRoomEspStatus(roomId, false);
      }
    }
    
    // Clean up ESP mapping
    espRoomMappings.delete(espId);
    
    console.log(`ESP ${espId} disconnected from room ${roomId}`);
  } catch (error) {
    console.error('Error handling ESP disconnection:', error);
  }
}

/**
 * Close the MQTT connection
 */
function close() {
  if (client) {
    client.end();
    console.log('MQTT connection closed');
  }
  
  // Clear ESP mappings
  espRoomMappings.clear();
  roomEspConnections.clear();
}

module.exports = {
  initialize,
  publishDeviceState,
  publishRoomState,
  publishEspStateUpdate,
  publishEspRoomStateUpdate,
  publishEspTaskUpdate,
  getEspRoomMapping,
  removeEspRoomMapping,
  handleEspDisconnection,
  updateRoomEspStatus,
  close,
  client,
  roomEspConnections,
  espRoomMappings 
};