const crypto = require('crypto');
const Device = require('../../models/Device');
const mqttBroker = require('../../mqtt/mqtt-broker');
const Room = require('../../models/Room'); // Added Room model
const { normalizeState } = require('../utils/stateUtils'); // Ensure normalizeState is available

/**
 * Set up the MQTT bridge namespace for devices that need to connect via WebSockets
 * but have their state updates published via MQTT
 * @param {Object} io - Socket.IO instance
 */
module.exports = (io) => {
  const mqttNamespace = io.of('/ws/mqtt-bridge');
  
  // Middleware for MQTT bridge namespace
  // Authenticates an ESP for a specific device slot in a room
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

      // Authenticate with room password if it exists
      if (room.roomPassword) {
        if (!roomPassword) {
          return next(new Error('Authentication failed: Room password required.'));
        }
        const isMatch = await room.matchRoomPassword(roomPassword);
        if (!isMatch) {
          return next(new Error('Authentication failed: Invalid room password.'));
        }
      }

      // Find the device by its order in the specified room
      const device = await Device.findOne({ room: room._id, order: order });
      if (!device) {
        return next(new Error(`Authentication failed: No device found at order ${order} in this room.`));
      }

      // Attach room and device to the socket object
      socket.room = room;
      socket.device = device;
      next();
    } catch (error) {
      console.error('MQTT bridge authentication error:', error);
      next(new Error('Authentication failed: Server error during authentication.'));
    }
  });

  // Connection handler
  mqttNamespace.on('connection', (socket) => {
    console.log(`ESP (Device Order: ${socket.device.order}) connected to MQTT bridge for room ${socket.room.name}: ${socket.id} (Device: ${socket.device.name})`);
    
    // Track ESP connection for room status
    const espId = `ws-${socket.id}`; // Create unique ESP ID for WebSocket connections
    mqttBroker.updateRoomEspStatus(socket.room._id.toString(), true);

    // Let the device know it's connected successfully
    socket.emit('mqtt-bridge-connected', { 
      deviceId: socket.device._id,
      deviceName: socket.device.name,
      deviceOrder: socket.device.order,
      roomId: socket.room._id,
      roomName: socket.room.name
    });
    
    // Join room-specific and device-specific socket rooms
    socket.join(`room:${socket.room._id}`);
    socket.join(`device:${socket.device._id}`);
    
    // Handle device reporting its state (for the specific device identified by order)
    socket.on('report-state', async (data) => {
      try {
        if (data.state === undefined) {
          return socket.emit('error', { message: 'State value is required' });
        }
        
        const newState = normalizeState(data.state); // Normalize state

        // Publish state update to MQTT
        mqttBroker.publishDeviceState(socket.device._id, newState, {
          updatedBy: 'device', // Or 'esp' to be more specific
          deviceId: socket.device._id.toString(),
          room: socket.room._id.toString()
        });
        
        socket.emit('state-reported', { success: true });
        
        console.log(`Device ${socket.device.name} (Order: ${socket.device.order}) in room ${socket.room.name} reported state ${newState} via MQTT bridge`);
      } catch (error) {
        console.error('Error reporting device state via MQTT bridge:', error);
        socket.emit('error', { message: 'Failed to report state', error: error.message });
      }
    });
    
    // Handle room state updates
    // This can still be used if the ESP controls multiple devices in the room
    // and wants to report them in bulk. The connection itself is authenticated
    // for one device slot, but this event allows broader reporting.
    socket.on('report-room-state', async (data) => {
      try {
        if (!data.roomId || !data.updates || !Array.isArray(data.updates)) {
          return socket.emit('error', { message: 'Invalid room state update format' });
        }
        
        // Ensure the reported room ID matches the connected room
        if (socket.room._id.toString() !== data.roomId) {
          return socket.emit('error', { message: 'Reported room ID does not match authenticated room.' });
        }

        mqttBroker.publishRoomState(data.roomId, data.updates, {
          updatedBy: 'esp-room-report', // Differentiate source
          deviceId: socket.device._id.toString()
        });
        
        socket.emit('room-state-reported', { success: true });
        
        console.log(`Device ${socket.device.name} reported room state via MQTT bridge`);
      } catch (error) {
        console.error('Error reporting room state via MQTT bridge:', error);
        socket.emit('error', { message: 'Failed to report room state', error: error.message });
      }
    });
    
    // Disconnect handler
    socket.on('disconnect', () => {
      console.log(`ESP (Device Order: ${socket.device.order}) disconnected from MQTT bridge for room ${socket.room.name}: ${socket.id} (Device: ${socket.device.name})`);
      
      // Publish offline status to MQTT
      mqttBroker.client?.publish(
        `home-automation/${socket.device._id}/status`,
        JSON.stringify({ status: 'offline', timestamp: new Date() }),
        { qos: 1, retain: true }
      );
      // Handle ESP disconnection for room status
      const espId = `ws-${socket.id}`; // Create unique ESP ID for WebSocket connections
      mqttBroker.handleEspDisconnection(espId);
    });
    
    // Publish online status to MQTT
    mqttBroker.client?.publish(
      `home-automation/${socket.device._id}/status`,
      JSON.stringify({ status: 'online', timestamp: new Date() }),
      { qos: 1, retain: true }
    );
  });
};