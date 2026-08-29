/**
 * Room MQTT message handlers + ESP connection-status updates.
 * @module mqtt/handlers/roomHandler
 */

const { context } = require('../context');
const Device = require('../../models/Device');
const Room = require('../../models/Room');
const { normalizeState } = require('../../websockets/utils/stateUtils');
const { publishEspRoomStateUpdate } = require('../publishers/espPublisher');
const logger = require('../../config/logger');

/**
 * Handle a bulk room state update message.
 * @param {string} roomId
 * @param {object} payload
 */
async function handleRoomStateMessage(roomId, payload) {
  try {
    if (!payload.updates || !Array.isArray(payload.updates)) {
      logger.warn('Invalid room state update format', { roomId });
      return;
    }

    const updatedDevices = [];

    for (const update of payload.updates) {
      if (!update.deviceId || update.state === undefined) {
        continue;
      }

      try {
        const device = await Device.findOne({ _id: update.deviceId, room: roomId });
        if (!device) {
          continue;
        }

        const newState = normalizeState(update.state);
        device.status = newState;
        await device.save();

        updatedDevices.push({
          deviceId: device._id,
          state: newState,
          order: device.order
        });
      } catch (deviceError) {
        logger.error('Error updating device in room state message', {
          deviceId: update.deviceId,
          error: deviceError.message
        });
      }
    }

    if (updatedDevices.length > 0) {
      updatedDevices.forEach((device) => {
        context.io.of('/ws/user').to(`device:${device.deviceId}`).emit('state-updated', {
          deviceId: device.deviceId,
          state: device.state,
          updatedBy: 'mqtt'
        });
      });

      context.io.of('/ws/room-user').to(`room:${roomId}`).emit('room-devices-updated', {
        roomId,
        updates: updatedDevices.map((d) => ({ deviceId: d.deviceId, state: d.state })),
        updatedBy: 'mqtt'
      });

      publishEspRoomStateUpdate(roomId, updatedDevices);
    }

    logger.debug('Updated devices in room via MQTT', { roomId, count: updatedDevices.length });
  } catch (error) {
    logger.error('Error handling room state message', { roomId, error: error.message });
  }
}

/**
 * Update a room's ESP connection status and notify users.
 * @param {string} roomId
 * @param {boolean} isConnected
 */
async function updateRoomEspStatus(roomId, isConnected) {
  try {
    await Room.findByIdAndUpdate(roomId, { esp_component_connected: isConnected });

    if (context.io && context.io.of('/ws/room-user')) {
      context.io.of('/ws/room-user').to(`room:${roomId}`).emit('room-esp-status-updated', {
        roomId,
        espConnected: isConnected,
        timestamp: new Date()
      });
    }

    logger.debug('Room ESP connection status updated', { roomId, isConnected });
  } catch (error) {
    logger.error('Error updating room ESP status', { roomId, error: error.message });
  }
}

module.exports = { handleRoomStateMessage, updateRoomEspStatus };