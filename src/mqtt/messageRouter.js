/**
 * Routes inbound MQTT messages to the appropriate handler based on topic.
 * @module mqtt/messageRouter
 */

const { matchTopic } = require('./topics');
const deviceHandler = require('./handlers/deviceHandler');
const roomHandler = require('./handlers/roomHandler');
const espHandler = require('./handlers/espHandler');
const logger = require('../config/logger');

/**
 * Parse a raw MQTT message into a JSON payload (with a raw-string fallback).
 */
function parsePayload(message) {
  try {
    return JSON.parse(message.toString());
  } catch {
    return { state: message.toString() };
  }
}

/**
 * Dispatch an inbound message to the matching handler.
 * @param {string} topic
 * @param {Buffer} message
 */
async function handleMessage(topic, message) {
  const route = matchTopic(topic);
  if (!route) return;

  const payload = parsePayload(message);

  try {
    switch (route.type) {
      case 'device-state':
        await deviceHandler.handleDeviceStateMessage(route.id, payload);
        break;
      case 'device-status':
        await deviceHandler.handleDeviceStatusMessage(route.id, payload);
        break;
      case 'room-state':
        await roomHandler.handleRoomStateMessage(route.id, payload);
        break;
      case 'esp-compact-state':
        await espHandler.handleEspCompactStateMessage(route.id, message.toString(), payload);
        break;
      case 'esp-auth':
        await espHandler.handleEspAuthMessage(route.id, payload);
        break;
      case 'esp-disconnect':
        await espHandler.handleEspDisconnection(route.id);
        break;
      default:
        break;
    }
  } catch (error) {
    logger.error('Error handling MQTT message', { topic, error: error.message });
  }
}

module.exports = { handleMessage };