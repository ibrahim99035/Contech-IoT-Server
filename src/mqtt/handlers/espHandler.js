/**
 * ESP MQTT message handlers (auth, compact state, disconnect).
 * @module mqtt/handlers/espHandler
 */

const { context, espRoomMappings, roomEspConnections } = require('../context');
const Device = require('../../models/Device');
const Room = require('../../models/Room');
const { normalizeState } = require('../../websockets/utils/stateUtils');
const { publishEspAuthResponse, publishEspCompactResponse } = require('../publishers/espPublisher');
const { updateRoomEspStatus } = require('./roomHandler');
const logger = require('../../config/logger');

/**
 * Handle an ESP authentication request.
 * ESP sends: { roomId, roomPassword }
 * @param {string} espId
 * @param {object} payload
 */
async function handleEspAuthMessage(espId, payload) {
  try {
    const { roomId, roomPassword } = payload;

    if (!roomId) {
      return publishEspAuthResponse(espId, { success: false, error: 'Room ID is required' });
    }

    const room = await Room.findById(roomId);
    if (!room) {
      return publishEspAuthResponse(espId, { success: false, error: 'Room not found' });
    }

    if (room.roomPassword) {
      if (!roomPassword) {
        return publishEspAuthResponse(espId, { success: false, error: 'Room password required' });
      }
      const isMatch = await room.matchRoomPassword(roomPassword);
      if (!isMatch) {
        return publishEspAuthResponse(espId, { success: false, error: 'Invalid room password' });
      }
    }

    const devices = await Device.find({ room: roomId }).sort({ order: 1 });

    espRoomMappings.set(espId, {
      roomId,
      roomName: room.name,
      authenticatedAt: new Date(),
      devices: devices.map((d) => ({
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
      roomId,
      roomName: room.name,
      availableDevices: devices.map((device) => ({
        order: device.order,
        deviceId: device._id.toString(),
        deviceName: device.name,
        currentState: device.status
      }))
    });

    logger.info('ESP authenticated for room', { espId, roomName: room.name, deviceCount: devices.length });
  } catch (error) {
    logger.error('Error handling ESP auth', { espId, error: error.message });
    publishEspAuthResponse(espId, { success: false, error: 'Server error during authentication' });
  }
}

/**
 * Handle an ESP compact state message (e.g. "21" = order 2, on).
 * @param {string} espId
 * @param {string} compactMessage
 * @param {object} payload
 */
async function handleEspCompactStateMessage(espId, compactMessage, payload) {
  try {
    const compactState = payload.compactState || compactMessage.trim();

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

    const device = await Device.findOne({ room: roomId, order: deviceOrder });
    if (!device) {
      return publishEspCompactResponse(espId, {
        success: false,
        error: `No device found at order ${deviceOrder} in room`
      });
    }

    const newState = stateIndicator === '1' ? 'on' : 'off';
    const normalizedState = normalizeState(newState);

    device.status = normalizedState;
    await device.save();

    const room = await Room.findById(roomId);

    context.io.of('/ws/user').to(`device:${device._id}`).emit('state-updated', {
      deviceId: device._id.toString(),
      state: normalizedState,
      updatedBy: 'esp-compact',
      roomId: device.room.toString(),
      espConnected: room ? room.esp_component_connected : false
    });

    if (device.room) {
      context.io.of('/ws/room-user').to(`room:${device.room}`).emit('room-devices-updated', {
        roomId: device.room.toString(),
        updates: [{ deviceId: device._id.toString(), state: normalizedState }],
        updatedBy: 'esp-compact'
      });
    }

    publishEspCompactResponse(espId, {
      success: true,
      deviceOrder,
      newState: normalizedState,
      deviceName: device.name,
      deviceId: device._id.toString()
    });

    logger.debug('ESP compact update processed', { espId, device: device.name, deviceOrder, state: normalizedState });
  } catch (error) {
    logger.error('Error handling ESP compact state', { espId, error: error.message });
    publishEspCompactResponse(espId, {
      success: false,
      error: 'Server error processing compact state'
    });
  }
}

/**
 * Subscribe an ESP to room-specific topics for receiving state updates.
 * @param {string} espId
 * @param {string} roomId
 */
function subscribeEspToRoom(espId, roomId) {
  if (!context.client || !context.client.connected) {
    logger.error('MQTT client not connected (subscribeEspToRoom)');
    return;
  }

  logger.debug('ESP should subscribe to room topics', {
    espId,
    topics: [
      `home-automation/esp/room/${roomId}/state-update`,
      `home-automation/esp/room/${roomId}/bulk-update`,
      `home-automation/esp/room/${roomId}/task-update`
    ]
  });
}

/**
 * Handle ESP disconnection cleanup.
 * @param {string} espId
 */
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

    logger.info('ESP disconnected from room', { espId, roomId });
  } catch (error) {
    logger.error('Error handling ESP disconnection', { espId, error: error.message });
  }
}

module.exports = {
  handleEspAuthMessage,
  handleEspCompactStateMessage,
  handleEspDisconnection,
  subscribeEspToRoom
};