/**
 * ESP-facing MQTT publishers.
 * Sends auth/compact responses and room state updates to ESP devices.
 * @module mqtt/publishers/espPublisher
 */

const { context } = require('../context');
const { topics } = require('../topics');
const logger = require('../../config/logger');

function publishEspAuthResponse(espId, response) {
  if (!context.client || !context.client.connected) {
    logger.error('MQTT client not connected (publishEspAuthResponse)');
    return;
  }
  context.client.publish(topics.espAuthResponse(espId), JSON.stringify(response), { qos: 1 });
}

function publishEspCompactResponse(espId, response) {
  if (!context.client || !context.client.connected) {
    logger.error('MQTT client not connected (publishEspCompactResponse)');
    return;
  }
  context.client.publish(topics.espCompactResponse(espId), JSON.stringify(response), { qos: 1 });
}

/**
 * Publish a single device state update to ESP devices in a room.
 */
function publishEspStateUpdate(roomId, deviceId, newState, deviceOrder) {
  if (!context.client || !context.client.connected) {
    logger.error('MQTT client not connected (publishEspStateUpdate)');
    return;
  }

  const stateUpdate = {
    deviceId,
    deviceOrder,
    state: newState,
    compactState: `${deviceOrder}${newState === 'on' ? '1' : '0'}`,
    timestamp: new Date()
  };

  context.client.publish(topics.espRoomStateUpdate(roomId), JSON.stringify(stateUpdate), { qos: 1 });
  logger.debug('Published state update to ESP devices in room', { roomId, deviceOrder, newState });
}

/**
 * Publish a bulk room state update to ESP devices.
 */
function publishEspRoomStateUpdate(roomId, updatedDevices) {
  if (!context.client || !context.client.connected) {
    logger.error('MQTT client not connected (publishEspRoomStateUpdate)');
    return;
  }

  const roomUpdate = {
    roomId,
    updates: updatedDevices.map((d) => ({
      deviceId: d.deviceId,
      deviceOrder: d.order,
      state: d.state,
      compactState: `${d.order}${d.state === 'on' ? '1' : '0'}`
    })),
    timestamp: new Date()
  };

  context.client.publish(topics.espRoomBulkUpdate(roomId), JSON.stringify(roomUpdate), { qos: 1 });
  logger.debug('Published bulk update to ESP devices in room', { roomId, count: updatedDevices.length });
}

/**
 * Publish a task update to ESP devices in a room.
 */
function publishEspTaskUpdate(roomId, taskData) {
  if (!context.client || !context.client.connected) {
    logger.error('MQTT client not connected (publishEspTaskUpdate)');
    return;
  }

  context.client.publish(
    topics.espRoomTaskUpdate(roomId),
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

module.exports = {
  publishEspAuthResponse,
  publishEspCompactResponse,
  publishEspStateUpdate,
  publishEspRoomStateUpdate,
  publishEspTaskUpdate
};