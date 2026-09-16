/**
 * MQTT Broker Facade.
 * Preserves the original public API so existing importers are unchanged:
 *   initialize, publishDeviceState, publishRoomState, publishEspStateUpdate,
 *   publishEspRoomStateUpdate, publishEspTaskUpdate, getEspRoomMapping,
 *   removeEspRoomMapping, handleEspDisconnection, updateRoomEspStatus,
 *   close, client, roomEspConnections, espRoomMappings.
 *
 * The actual implementation now lives in focused modules under src/mqtt/.
 * @module mqtt/mqtt-broker
 */

const { context, espRoomMappings, roomEspConnections } = require('./context');
const clientModule = require('./client');
const { handleMessage } = require('./messageRouter');
const devicePublisher = require('./publishers/devicePublisher');
const espPublisher = require('./publishers/espPublisher');
const { handleEspDisconnection } = require('./handlers/espHandler');
const { updateRoomEspStatus } = require('./handlers/roomHandler');
const taskEvents = require('../websockets/taskEventEmitter');
const logger = require('../config/logger');

/**
 * Publish task execution/failure to MQTT and to ESP devices.
 */
function registerTaskEventHandlers() {
  taskEvents.on('task-executed', async (task) => {
    try {
      context.client.publish(
        `home-automation/${task.device._id}/task`,
        JSON.stringify({
          taskId: task._id,
          status: 'executed',
          message: `Task "${task.name}" was executed.`,
          timestamp: new Date()
        })
      );

      if (task.device.room) {
        espPublisher.publishEspTaskUpdate(task.device.room.toString(), {
          _id: task._id,
          device: task.device,
          status: 'executed',
          message: `Task "${task.name}" was executed.`
        });
      }
    } catch (error) {
      logger.error('Error publishing task execution to MQTT', { error: error.message });
    }
  });

  taskEvents.on('task-failed', async (task, error) => {
    try {
      context.client.publish(
        `home-automation/${task.device._id}/task`,
        JSON.stringify({
          taskId: task._id,
          status: 'failed',
          message: `Task "${task.name}" failed: ${error}`,
          timestamp: new Date()
        })
      );

      if (task.device.room) {
        espPublisher.publishEspTaskUpdate(task.device.room.toString(), {
          _id: task._id,
          device: task.device,
          status: 'failed',
          message: `Task "${task.name}" failed: ${error}`
        });
      }
    } catch (err) {
      logger.error('Error publishing task failure to MQTT', { error: err.message });
    }
  });
}

/**
 * Initialize the MQTT client and connect to the broker.
 * @param {object} socketIo - Socket.IO instance for broadcasting events
 */
async function initialize(socketIo) {
  context.io = socketIo;
  await clientModule.connectBroker(handleMessage);
  registerTaskEventHandlers();
}

const facade = {
  initialize,
  publishDeviceState: devicePublisher.publishDeviceState,
  publishRoomState: devicePublisher.publishRoomState,
  publishEspStateUpdate: espPublisher.publishEspStateUpdate,
  publishEspRoomStateUpdate: espPublisher.publishEspRoomStateUpdate,
  publishEspTaskUpdate: espPublisher.publishEspTaskUpdate,
  getEspRoomMapping: (espId) => espRoomMappings.get(espId),
  removeEspRoomMapping: (espId) => espRoomMappings.delete(espId),
  handleEspDisconnection,
  updateRoomEspStatus,
  close: clientModule.close,
  roomEspConnections,
  espRoomMappings
};

// Export `client` as a live getter so it reflects the current connection.
Object.defineProperty(facade, 'client', {
  get: () => context.client,
  enumerable: true
});

module.exports = facade;