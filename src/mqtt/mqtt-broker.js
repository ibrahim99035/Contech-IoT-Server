const mqtt = require('mqtt');
const taskEvents = require('../websockets/taskEventEmitter');
const { normalizeState } = require('../websockets/utils/stateUtils');
const Device = require('../models/Device');
const Room = require('../models/Room');

let client;
let io;

// ESP-Room mapping storage
const espRoomMappings = new Map();
const roomEspConnections = new Map();

// NEW: Message deduplication tracker
const recentMessages = new Map(); // key: messageId, value: timestamp
const MESSAGE_DEDUP_WINDOW = 2000; // 2 seconds

/**
 * Generate a unique message ID for deduplication
 */
function generateMessageId(deviceId, state, source) {
  return `${deviceId}:${state}:${source}:${Date.now()}`;
}

/**
 * Check if a message was recently processed
 */
function isDuplicateMessage(deviceId, state, source) {
  const messageKey = `${deviceId}:${state}:${source}`;
  const now = Date.now();
  
  // Clean up old entries
  for (const [key, timestamp] of recentMessages.entries()) {
    if (now - timestamp > MESSAGE_DEDUP_WINDOW) {
      recentMessages.delete(key);
    }
  }
  
  // Check if this exact message was processed recently
  if (recentMessages.has(messageKey)) {
    const lastTime = recentMessages.get(messageKey);
    if (now - lastTime < MESSAGE_DEDUP_WINDOW) {
      return true; // Duplicate
    }
  }
  
  // Mark as processed
  recentMessages.set(messageKey, now);
  return false;
}

/**
 * Initialize the MQTT client and connect to the MQTT broker
 */
function initialize(socketIo) {
  io = socketIo;
  
  const brokerUrl = process.env.MQTT_BROKER_URL || 'mqtt://localhost:1883';
  const options = {
    clientId: `home-automation-server-${Math.random().toString(16).substring(2, 10)}`,
    username: process.env.MQTT_USERNAME,
    password: process.env.MQTT_PASSWORD,
    clean: true,
    reconnectPeriod: 5000
  };
  
  client = mqtt.connect(brokerUrl, options);
  
  client.on('connect', () => {
    console.log('Connected to MQTT broker');
    
    client.subscribe('home-automation/+/state', (err) => {
      if (err) console.error('Error subscribing to device state topics:', err);
      else console.log('Subscribed to device state topics');
    });
    
    client.subscribe('home-automation/+/status', (err) => {
      if (err) console.error('Error subscribing to device status topics:', err);
      else console.log('Subscribed to device status topics');
    });
    
    client.subscribe('home-automation/room/+/state', (err) => {
      if (err) console.error('Error subscribing to room state topics:', err);
      else console.log('Subscribed to room state topics');
    });

    client.subscribe('home-automation/esp/+/compact-state', (err) => {
      if (err) console.error('Error subscribing to ESP compact state topics:', err);
      else console.log('Subscribed to ESP compact state topics');
    });

    client.subscribe('home-automation/esp/+/auth', (err) => {
      if (err) console.error('Error subscribing to ESP auth topics:', err);
      else console.log('Subscribed to ESP auth topics');
    });
  });
  
  client.on('error', (err) => console.error('MQTT error:', err));
  client.on('reconnect', () => console.log('Reconnecting to MQTT broker...'));
  client.on('message', handleMqttMessage);
  
  registerTaskEventHandlers();
}

/**
 * Handle incoming MQTT messages
 */
async function handleMqttMessage(topic, message) {
  try {
    console.log(`MQTT message received: ${topic} - ${message.toString()}`);
    
    let payload;
    try {
      payload = JSON.parse(message.toString());
    } catch (e) {
      payload = { state: message.toString() };
    }
    
    if (topic.match(/^home-automation\/([^\/]+)\/state$/)) {
      const deviceId = topic.split('/')[1];
      await handleDeviceStateMessage(deviceId, payload);
    } 
    else if (topic.match(/^home-automation\/([^\/]+)\/status$/)) {
      const deviceId = topic.split('/')[1];
      await handleDeviceStatusMessage(deviceId, payload);
    }
    else if (topic.match(/^home-automation\/room\/([^\/]+)\/state$/)) {
      const roomId = topic.split('/')[2];
      await handleRoomStateMessage(roomId, payload);
    }
    else if (topic.match(/^home-automation\/esp\/([^\/]+)\/compact-state$/)) {
      const espId = topic.split('/')[2];
      await handleEspCompactStateMessage(espId, message.toString(), payload);
    }
    else if (topic.match(/^home-automation\/esp\/([^\/]+)\/auth$/)) {
      const espId = topic.split('/')[2];
      await handleEspAuthMessage(espId, payload);
    }
    else if (topic.match(/^home-automation\/esp\/([^\/]+)\/disconnect$/)) {
      const espId = topic.split('/')[2];
      await handleEspDisconnection(espId);
    }
  } catch (error) {
    console.error('Error handling MQTT message:', error);
  }
}

/**
 * Handle ESP authentication requests
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
    
    const room = await Room.findById(roomId);
    if (!room) {
      return publishEspAuthResponse(espId, {
        success: false,
        error: 'Room not found'
      });
    }
    
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
    
    const devices = await Device.find({ room: roomId }).sort({ order: 1 });
    
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

    await updateRoomEspStatus(roomId, true);
    subscribeEspToRoom(espId, roomId);
    
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
 */
async function handleEspCompactStateMessage(espId, compactMessage, payload) {
  try {
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
    
    const espMapping = espRoomMappings.get(espId);
    if (!espMapping) {
      return publishEspCompactResponse(espId, {
        success: false,
        error: 'ESP not authenticated. Please authenticate first.'
      });
    }
    
    const roomId = espMapping.roomId;
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
    
    // FIXED: Check for duplicate before processing
    if (isDuplicateMessage(device._id.toString(), normalizedState, 'esp-compact')) {
      console.log(`Duplicate ESP compact message ignored: ${device.name}`);
      return;
    }
    
    device.status = normalizedState;
    await device.save();
    
    // Notify WebSocket clients
    io.of('/ws/user').to(`device:${device._id}`).emit('state-updated', {
      deviceId: device._id.toString(),
      state: normalizedState,
      updatedBy: 'esp-compact'
    });
    
    if (device.room) {
      io.of('/ws/room-user').to(`room:${device.room}`).emit('room-devices-updated', {
        roomId: device.room.toString(),
        updates: [{ deviceId: device._id.toString(), state: normalizedState }],
        updatedBy: 'esp-compact'
      });
    }
    
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
 * Handle device state messages
 * FIXED: Only broadcast to WebSockets, don't republish to MQTT/ESP to avoid loops
 */
async function handleDeviceStateMessage(deviceId, payload) {
  try {
    const device = await Device.findById(deviceId);
    
    if (!device) {
      return console.error(`Device not found: ${deviceId}`);
    }
    
    const newState = normalizeState(payload.state);
    const source = payload.updatedBy || 'mqtt';
    
    // FIXED: Check for duplicate
    if (isDuplicateMessage(deviceId, newState, source)) {
      console.log(`Duplicate MQTT message ignored: ${device.name}`);
      return;
    }
    
    device.status = newState;
    await device.save();
    
    // Broadcast to WebSocket clients only
    io.of('/ws/user').to(`device:${deviceId}`).emit('state-updated', {
      deviceId: deviceId,
      state: newState,
      updatedBy: source
    });
    
    if (device.room) {
      io.of('/ws/room-user').to(`room:${device.room}`).emit('room-devices-updated', {
        roomId: device.room,
        updates: [{
          deviceId: deviceId,
          state: newState
        }],
        updatedBy: source
      });
      
      // FIXED: Only notify ESP if the source was NOT from ESP or device
      if (source !== 'esp-compact' && source !== 'device' && source !== 'esp-room-report') {
        publishEspStateUpdate(device.room.toString(), deviceId, newState, device.order);
      }
    }
    
    console.log(`Device ${device.name} state updated via MQTT to ${newState} (source: ${source})`);
  } catch (error) {
    console.error('Error handling device state message:', error);
  }
}

/**
 * Handle device status messages (online/offline)
 */
async function handleDeviceStatusMessage(deviceId, payload) {
  try {
    const device = await Device.findById(deviceId);
    
    if (!device) {
      return console.error(`Device not found: ${deviceId}`);
    }
    
    const isOnline = payload.status === 'online';
    device.isOnline = isOnline;
    await device.save();
    
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
    
    const source = payload.updatedBy || 'mqtt';
    const updatedDevices = [];
    
    for (const update of payload.updates) {
      if (!update.deviceId || update.state === undefined) continue;
      
      try {
        const device = await Device.findOne({
          _id: update.deviceId,
          room: roomId
        });
        
        if (!device) continue;
        
        const newState = normalizeState(update.state);
        
        // FIXED: Check for duplicate
        if (isDuplicateMessage(device._id.toString(), newState, source)) {
          console.log(`Duplicate room state message ignored: ${device.name}`);
          continue;
        }
        
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
    
    if (updatedDevices.length > 0) {
      updatedDevices.forEach(device => {
        io.of('/ws/user').to(`device:${device.deviceId}`).emit('state-updated', {
          deviceId: device.deviceId,
          state: device.state,
          updatedBy: source
        });
      });
      
      io.of('/ws/room-user').to(`room:${roomId}`).emit('room-devices-updated', {
        roomId: roomId,
        updates: updatedDevices.map(d => ({ deviceId: d.deviceId, state: d.state })),
        updatedBy: source
      });
      
      // FIXED: Only notify ESP if source was NOT from ESP
      if (source !== 'esp-compact' && source !== 'device' && source !== 'esp-room-report') {
        publishEspRoomStateUpdate(roomId, updatedDevices);
      }
    }
    
    console.log(`Updated ${updatedDevices.length} devices in room ${roomId} via MQTT (source: ${source})`);
  } catch (error) {
    console.error('Error handling room state message:', error);
  }
}

function subscribeEspToRoom(espId, roomId) {
  if (!client || !client.connected) {
    return console.error('MQTT client not connected');
  }
  
  console.log(`ESP ${espId} should subscribe to:`);
  console.log(`- home-automation/esp/room/${roomId}/state-update`);
  console.log(`- home-automation/esp/room/${roomId}/bulk-update`);
  console.log(`- home-automation/esp/room/${roomId}/task-update`);
}

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

function publishEspStateUpdate(roomId, deviceId, newState, deviceOrder) {
  if (!client || !client.connected) {
    return console.error('MQTT client not connected');
  }
  
  const stateUpdate = {
    deviceId: deviceId,
    deviceOrder: deviceOrder,
    state: newState,
    compactState: `${deviceOrder}${newState === 'on' ? '1' : '0'}`,
    timestamp: new Date()
  };
  
  client.publish(
    `home-automation/esp/room/${roomId}/state-update`,
    JSON.stringify(stateUpdate),
    { qos: 1 }
  );
  
  console.log(`Published state update to ESP devices in room ${roomId}: Device ${deviceOrder} -> ${newState}`);
}

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
      compactState: `${d.order}${d.state === 'on' ? '1' : '0'}`
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

function registerTaskEventHandlers() {
  taskEvents.on('task-executed', async (task) => {
    try {
      client.publish(
        `home-automation/${task.device._id}/task`, 
        JSON.stringify({
          taskId: task._id,
          status: 'executed',
          message: `Task "${task.name}" was executed.`,
          timestamp: new Date()
        })
      );
      
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
      client.publish(
        `home-automation/${task.device._id}/task`,
        JSON.stringify({
          taskId: task._id,
          status: 'failed',
          message: `Task "${task.name}" failed: ${error}`,
          timestamp: new Date()
        })
      );
      
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
 * Publish a device state update to MQTT
 * FIXED: Don't call publishEspStateUpdate here to avoid double publishing
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
  
  client.publish(
    `home-automation/${deviceId}/state`,
    JSON.stringify(payload),
    { qos: 1, retain: true }
  );
  
  console.log(`Published state ${state} to device ${deviceId} via MQTT`);
  
  // REMOVED: The duplicate ESP notification from here
  // ESP will be notified when the MQTT message is processed by handleDeviceStateMessage
}

/**
 * Publish room devices state update to MQTT
 * FIXED: Don't call publishEspRoomStateUpdate here to avoid double publishing
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
  
  // REMOVED: The duplicate ESP notification from here
  // ESP will be notified when the MQTT message is processed by handleRoomStateMessage
}

function getEspRoomMapping(espId) {
  return espRoomMappings.get(espId);
}

function removeEspRoomMapping(espId) {
  return espRoomMappings.delete(espId);
}

async function updateRoomEspStatus(roomId, isConnected) {
  try {
    await Room.findByIdAndUpdate(roomId, { 
      esp_component_connected: isConnected 
    });
    
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

async function handleEspDisconnection(espId) {
  try {
    const espMapping = espRoomMappings.get(espId);
    if (!espMapping) return;
    
    const roomId = espMapping.roomId;
    
    if (roomEspConnections.has(roomId)) {
      roomEspConnections.get(roomId).delete(espId);
      
      if (roomEspConnections.get(roomId).size === 0) {
        roomEspConnections.delete(roomId);
        await updateRoomEspStatus(roomId, false);
      }
    }
    
    espRoomMappings.delete(espId);
    
    console.log(`ESP ${espId} disconnected from room ${roomId}`);
  } catch (error) {
    console.error('Error handling ESP disconnection:', error);
  }
}

function close() {
  if (client) {
    client.end();
    console.log('MQTT connection closed');
  }
  
  espRoomMappings.clear();
  roomEspConnections.clear();
  recentMessages.clear(); // ADDED: Clear dedup tracker
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
  client 
};