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

  // Safety gate: local/dev runs point MQTT_BROKER_URL at the PRODUCTION broker
  // (see client.js resolveBrokerUrl). Opt out with MQTT_ENABLED=false so a local
  // server never subscribes to production topics.
  if (String(process.env.MQTT_ENABLED ?? 'true').toLowerCase() === 'false') {
    logger.warn('MQTT is disabled (MQTT_ENABLED=false); skipping broker connection');
    return;
  }

  // connectBroker now waits for the broker's CONNACK, so a false here means the
  // broker is genuinely unusable (bad host, wrong credentials, or auth refused).
  // Say so loudly: previously this reported success while every subscribe failed,
  // and MQTT was silently dead for the whole process lifetime.
  const connected = await clientModule.connectBroker(handleMessage);
  if (!connected) {
    logger.error(
      'MQTT is NOT connected. Device/room state from the broker will not be received, ' +
      'and task events will not be published. Check MQTT_BROKER_URL, MQTT_USERNAME and ' +
      'MQTT_PASSWORD (a broker that is reachable but rejects the credentials fails here).',
      { brokerUrl: process.env.MQTT_BROKER_URL }
    );
    return;
  }

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