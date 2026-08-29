/**
 * User/room-facing MQTT publishers.
 * Publishes device and room state changes (so ESP devices and downstream
 * subscribers receive user-initiated updates).
 * @module mqtt/publishers/devicePublisher
 */

const { context } = require('../context');
const { topics } = require('../topics');
const { normalizeState } = require('../../websockets/utils/stateUtils');
const Device = require('../../models/Device');
const { publishEspStateUpdate, publishEspRoomStateUpdate } = require('./espPublisher');
const logger = require('../../config/logger');

/**
 * Publish a device state update to MQTT (called when users change states).
 * @param {string} deviceId
 * @param {string} state
 * @param {object} [options]
 */
function publishDeviceState(deviceId, state, options = {}) {
  if (!context.client || !context.client.connected) {
    logger.error('MQTT client not connected (publishDeviceState)');
    return;
  }

  const payload = {
    state: normalizeState(state),
    timestamp: new Date(),
    ...options
  };

  context.client.publish(topics.deviceState(deviceId), JSON.stringify(payload), { qos: 1, retain: true });
  logger.debug('Published state to device via MQTT', { deviceId, state: payload.state });

  // Also notify ESP devices if this device belongs to a room
  Device.findById(deviceId)
    .then((device) => {
      if (device && device.room) {
        publishEspStateUpdate(device.room.toString(), deviceId, normalizeState(state), device.order);
      }
    })
    .catch((err) => {
      logger.error('Error finding device for ESP notification', { error: err.message });
    });
}

/**
 * Publish a room devices state update to MQTT.
 * @param {string} roomId
 * @param {Array<{deviceId: string, state: string}>} updates
 * @param {object} [options]
 */
function publishRoomState(roomId, updates, options = {}) {
  if (!context.client || !context.client.connected) {
    logger.error('MQTT client not connected (publishRoomState)');
    return;
  }

  const payload = {
    updates: updates.map((update) => ({
      deviceId: update.deviceId,
      state: normalizeState(update.state)
    })),
    timestamp: new Date(),
    ...options
  };

  context.client.publish(topics.roomState(roomId), JSON.stringify(payload), { qos: 1 });
  logger.debug('Published state updates for room via MQTT', { roomId, count: updates.length });

  // Also create ESP-friendly updates
  Device.find({
    _id: { $in: updates.map((u) => u.deviceId) },
    room: roomId
  })
    .then((devices) => {
      const espUpdates = devices.map((device) => {
        const update = updates.find((u) => u.deviceId.toString() === device._id.toString());
        return {
          deviceId: device._id,
          state: normalizeState(update.state),
          order: device.order
        };
      });

      if (espUpdates.length > 0) {
        publishEspRoomStateUpdate(roomId, espUpdates);
      }
    })
    .catch((err) => {
      logger.error('Error finding devices for ESP room notification', { error: err.message });
    });
}

module.exports = { publishDeviceState, publishRoomState };