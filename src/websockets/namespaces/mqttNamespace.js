const crypto = require('crypto');
const Device = require('../../models/Device');
const Room = require('../../models/Room');
const mqttBroker = require('../../mqtt/mqtt-broker');
const { normalizeState } = require('../utils/stateUtils');

module.exports = (io) => {
  const mqttNamespace = io.of('/ws/mqtt-bridge');
  
  // Keep existing middleware (authentication) - don't change it
  mqttNamespace.use(async (socket, next) => {
    const { roomId, roomPassword, deviceOrder } = socket.handshake.query;
    if (!roomId || !deviceOrder) {
      return next(new Error('Authentication failed: Room ID and Device Order are required.'));
    }
    const order = parseInt(deviceOrder, 10);
    if (isNaN(order) || order < 1 || order > 6) {
      return next(new Error('Authentication failed: Invalid Device Order (must be 1-6).'));
    }
    try {
      const room = await Room.findById(roomId);
      if (!room) {
        return next(new Error('Authentication failed: Room not found.'));
      }
      if (room.roomPassword) {
        if (!roomPassword) {
          return next(new Error('Authentication failed: Room password required.'));
        }
        const isMatch = await room.matchRoomPassword(roomPassword);
        if (!isMatch) {
          return next(new Error('Authentication failed: Invalid room password.'));
        }
      }
      const device = await Device.findOne({ room: room._id, order: order });
      if (!device) {
        return next(new Error(`Authentication failed: No device found at order ${order} in this room.`));
      }
      socket.room = room;
      socket.device = device;
      next();
    } catch (error) {
      console.error('MQTT bridge authentication error:', error);
      next(new Error('Authentication failed: Server error during authentication.'));
    }
  });

  // FIXED connection handler:
  mqttNamespace.on('connection', (socket) => {
    const espId = `ws-${socket.id}`;
    const roomId = socket.room._id.toString();
    
    console.log(`ESP connected: ${espId} for room ${socket.room.name} (roomId: ${roomId})`);
    
    // Add to roomEspConnections
    if (!mqttBroker.roomEspConnections.has(roomId)) {
      mqttBroker.roomEspConnections.set(roomId, new Set());
    }
    mqttBroker.roomEspConnections.get(roomId).add(espId);
    console.log(`✅ ESP ${espId} added to room ${roomId}. Total ESPs: ${mqttBroker.roomEspConnections.get(roomId).size}`);
    
    // Add to espRoomMappings (so disconnect can find it)
    mqttBroker.espRoomMappings.set(espId, {
      roomId: roomId,
      roomName: socket.room.name,
      deviceId: socket.device._id.toString(),
      connectionType: 'websocket',
      connectedAt: new Date()
    });
    
    mqttBroker.updateRoomEspStatus(roomId, true);
    
    socket.emit('mqtt-bridge-connected', { 
      deviceId: socket.device._id,
      deviceName: socket.device.name,
      deviceOrder: socket.device.order,
      roomId: socket.room._id,
      roomName: socket.room.name
    });
    
    socket.join(`room:${socket.room._id}`);
    socket.join(`device:${socket.device._id}`);
    
    socket.on('report-state', async (data) => {
      try {
        if (data.state === undefined) {
          return socket.emit('error', { message: 'State value is required' });
        }
        const newState = normalizeState(data.state);
        mqttBroker.publishDeviceState(socket.device._id, newState, {
          updatedBy: 'device',
          deviceId: socket.device._id.toString(),
          room: socket.room._id.toString()
        });
        socket.emit('state-reported', { success: true });
      } catch (error) {
        console.error('Error reporting device state:', error);
        socket.emit('error', { message: 'Failed to report state', error: error.message });
      }
    });
    
    socket.on('report-room-state', async (data) => {
      try {
        if (!data.roomId || !data.updates || !Array.isArray(data.updates)) {
          return socket.emit('error', { message: 'Invalid room state update format' });
        }
        if (socket.room._id.toString() !== data.roomId) {
          return socket.emit('error', { message: 'Reported room ID does not match authenticated room.' });
        }
        mqttBroker.publishRoomState(data.roomId, data.updates, {
          updatedBy: 'esp-room-report',
          deviceId: socket.device._id.toString()
        });
        socket.emit('room-state-reported', { success: true });
      } catch (error) {
        console.error('Error reporting room state:', error);
        socket.emit('error', { message: 'Failed to report room state', error: error.message });
      }
    });
    
    // ✅ CRITICAL FIX: Proper disconnect handler that retrieves roomId from mapping
    socket.on('disconnect', async () => {
      console.log(`🔌 ESP disconnecting: ${espId}`);
      
      try {
        // Get roomId from espRoomMappings (more reliable than closure)
        const espMapping = mqttBroker.espRoomMappings.get(espId);
        
        if (!espMapping) {
          console.warn(`⚠️ No mapping found for ESP ${espId} during disconnect`);
          return;
        }
        
        const mappedRoomId = espMapping.roomId;
        console.log(`📍 Found room mapping: ${mappedRoomId} for ESP ${espId}`);
        
        // Remove from roomEspConnections
        if (mqttBroker.roomEspConnections.has(mappedRoomId)) {
          mqttBroker.roomEspConnections.get(mappedRoomId).delete(espId);
          const remainingCount = mqttBroker.roomEspConnections.get(mappedRoomId).size;
          console.log(`📊 Remaining ESPs in room ${mappedRoomId}: ${remainingCount}`);
          
          // If no more ESPs, set status to false
          if (remainingCount === 0) {
            mqttBroker.roomEspConnections.delete(mappedRoomId);
            await mqttBroker.updateRoomEspStatus(mappedRoomId, false);
            console.log(`❌ Room ${mappedRoomId} ESP status set to FALSE (no more ESPs connected)`);
          }
        } else {
          console.warn(`⚠️ Room ${mappedRoomId} not found in roomEspConnections during disconnect`);
        }
        
        // Remove from espRoomMappings
        mqttBroker.espRoomMappings.delete(espId);
        console.log(`🗑️ ESP ${espId} removed from mappings`);
        
      } catch (error) {
        console.error(`❌ Error handling disconnect for ${espId}:`, error);
      }
    });
    
    mqttBroker.client?.publish(
      `home-automation/${socket.device._id}/status`,
      JSON.stringify({ status: 'online', timestamp: new Date() }),
      { qos: 1, retain: true }
    );
  });
};