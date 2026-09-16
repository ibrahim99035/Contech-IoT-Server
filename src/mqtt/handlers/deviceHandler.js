/**
 * Device MQTT message handlers.
 * @module mqtt/handlers/deviceHandler
 */

const { context } = require('../context');
const Device = require('../../models/Device');
const { normalizeState } = require('../../websockets/utils/stateUtils');
const { publishEspStateUpdate } = require('../publishers/espPublisher');
const logger = require('../../config/logger');

/**
 * Handle a device state update message.
 * @param {string} deviceId
 * @param {object} payload
 */
async function handleDeviceStateMessage(deviceId, payload) {
  try {
    const device = await Device.findById(deviceId);
    if (!device) {
      logger.warn('MQTT state: device not found', { deviceId });
      return;
    }

    const newState = normalizeState(payload.state);
    device.status = newState;
    await device.save();

    context.io.of('/ws/user').to(`device:${deviceId}`).emit('state-updated', {
      deviceId,
      state: newState,
      updatedBy: 'mqtt'
    });

    if (device.room) {
      context.io.of('/ws/room-user').to(`room:${device.room}`).emit('room-devices-updated', {
        roomId: device.room,
        updates: [{ deviceId, state: newState }],
        updatedBy: 'mqtt'
      });

      publishEspStateUpdate(device.room.toString(), deviceId, newState, device.order);
    }

    logger.debug('Device state updated via MQTT', { deviceId, newState });
  } catch (error) {
    logger.error('Error handling device state message', { deviceId, error: error.message });
  }
}

/**
 * Handle a device connection status message (online/offline).
 * @param {string} deviceId
 * @param {object} payload
 */
async function handleDeviceStatusMessage(deviceId, payload) {
  try {
    const device = await Device.findById(deviceId);
    if (!device) {
      logger.warn('MQTT status: device not found', { deviceId });
      return;
    }

    const isOnline = payload.status === 'online';
    device.isOnline = isOnline;
    await device.save();

    context.io.of('/ws/user').to(`device:${deviceId}`).emit('device-status', {
      deviceId,
      isOnline,
      updatedBy: 'mqtt'
    });

    logger.debug('Device connection status updated via MQTT', { deviceId, isOnline });
  } catch (error) {
    logger.error('Error handling device status message', { deviceId, error: error.message });
  }
}

module.exports = { handleDeviceStateMessage, handleDeviceStatusMessage };