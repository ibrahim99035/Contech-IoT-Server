// src/mqtt/mqtt-broker.js
const mqtt = require('mqtt');
const taskEvents = require('../websockets/taskEventEmitter');
const { normalizeState } = require('../websockets/utils/stateUtils');
const Device = require('../models/Device');

let client;
let io;

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
  } catch (error) {
    console.error('Error handling MQTT message:', error);
  }
}

/**
 * Handle device state messages
 * @param {String} deviceId - Device ID
 * @param {Object} payload - Message payload
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
    }
    
    console.log(`Device ${device.name} state updated via MQTT to ${newState}`);
  } catch (error) {
    console.error('Error handling device state message:', error);
  }
}

/**
 * Handle device status messages (online/offline)
 * @param {String} deviceId - Device ID
 * @param {Object} payload - Message payload
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
 * @param {String} roomId - Room ID
 * @param {Object} payload - Message payload with multiple device updates
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
          state: newState
        });
      } catch (deviceError) {
        console.error(`Error updating device ${update.deviceId}:`, deviceError);
      }
    }
    
    // Notify all relevant parties about the updates
    if (updatedDevices.length > 0) {
      // Notify individual devices
      updatedDevices.forEach(device => {
        io.of('/ws/device').to(`device:${device.deviceId}`).emit('state-update', {
          state: device.state,
          updatedBy: 'mqtt'
        });
        
        // Notify users subscribed to the specific device
        io.of('/ws/user').to(`device:${device.deviceId}`).emit('state-updated', {
          deviceId: device.deviceId,
          state: device.state,
          updatedBy: 'mqtt'
        });
      });
      
      // Notify room-user namespace about bulk updates
      io.of('/ws/room-user').to(`room:${roomId}`).emit('room-devices-updated', {
        roomId: roomId,
        updates: updatedDevices,
        updatedBy: 'mqtt'
      });
    }
    
    console.log(`Updated ${updatedDevices.length} devices in room ${roomId} via MQTT`);
  } catch (error) {
    console.error('Error handling room state message:', error);
  }
}

/**
 * Register task event handlers to publish updates to MQTT
 */
function registerTaskEventHandlers() {
  taskEvents.on('task-executed', async (task) => {
    try {
      // Publish task execution to MQTT
      client.publish(
        `home-automation/${task.device._id}/task`, 
        JSON.stringify({
          taskId: task._id,
          status: 'executed',
          message: `Task "${task.name}" was executed.`,
          timestamp: new Date()
        })
      );
    } catch (error) {
      console.error('Error publishing task execution to MQTT:', error);
    }
  });
  
  taskEvents.on('task-failed', async (task, error) => {
    try {
      // Publish task failure to MQTT
      client.publish(
        `home-automation/${task.device._id}/task`,
        JSON.stringify({
          taskId: task._id,
          status: 'failed',
          message: `Task "${task.name}" failed: ${error}`,
          timestamp: new Date()
        })
      );
    } catch (err) {
      console.error('Error publishing task failure to MQTT:', err);
    }
  });
}

/**
 * Publish a device state update to MQTT
 * @param {String} deviceId - Device ID
 * @param {String} state - Device state
 * @param {Object} options - Additional options
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
}

/**
 * Publish room devices state update to MQTT
 * @param {String} roomId - Room ID
 * @param {Array} updates - Array of device updates
 * @param {Object} options - Additional options
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
}

/**
 * Close the MQTT connection
 */
function close() {
  if (client) {
    client.end();
    console.log('MQTT connection closed');
  }
}

module.exports = {
  initialize,
  publishDeviceState,
  publishRoomState,
  close
};