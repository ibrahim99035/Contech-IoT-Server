/**
 * MQTT client connection lifecycle.
 * Handles broker discovery (production / docker / local), an embedded Aedes
 * fallback, and the connection event handlers. The message router is wired in
 * by the facade via onMessage.
 * @module mqtt/client
 */

const mqtt = require('mqtt');
const net = require('net');
const { context } = require('./context');
const { SUBSCRIPTIONS } = require('./topics');
const logger = require('../config/logger');

let embeddedBrokerServer = null;

/**
 * Check if a TCP port is open on a host.
 */
function isPortOpen(port, host = '127.0.0.1') {
  return new Promise((resolve) => {
    const socket = new net.Socket();
    socket.setTimeout(1000);
    socket.on('connect', () => {
      socket.destroy();
      resolve(true);
    });
    socket.on('timeout', () => {
      socket.destroy();
      resolve(false);
    });
    socket.on('error', () => {
      socket.destroy();
      resolve(false);
    });
    socket.connect(port, host);
  });
}

/**
 * Start an embedded local Aedes MQTT broker if no broker is active.
 */
async function startEmbeddedBroker(port = 1883) {
  if (embeddedBrokerServer) return true;
  try {
    const { Aedes } = require('aedes');
    const aedesInstance = new Aedes({
      authenticate: (client, username, password, callback) => {
        callback(null, true); // Authenticate all local connections
      }
    });
    const server = net.createServer(aedesInstance.handle);
    await new Promise((resolve, reject) => {
      server.listen(port, () => {
        logger.info(`Started embedded local MQTT broker (Aedes) on 127.0.0.1:${port}`);
        resolve();
      });
      server.on('error', reject);
    });
    embeddedBrokerServer = server;
    return true;
  } catch (err) {
    logger.warn(`Could not start embedded MQTT broker on port ${port}: ${err.message}`);
    return false;
  }
}

/**
 * Resolve the effective broker URL, falling back gracefully.
 * @returns {Promise<string>}
 */
async function resolveBrokerUrl() {
  let brokerUrl = process.env.MQTT_BROKER_URL || 'mqtt://localhost:1883';

  // Local fallback handling when running outside Docker
  if (brokerUrl.includes('mqtt-broker')) {
    const prodHost = process.env.MQTT_PRODUCTION_BROKER_HOST || '88.222.220.235';
    const prodPort = parseInt(process.env.MQTT_PRODUCTION_BROKER_PORT || '1884', 10);
    const isProdReachable = await isPortOpen(prodPort, prodHost);

    if (isProdReachable) {
      brokerUrl = `mqtt://${prodHost}:${prodPort}`;
      logger.info('Host "mqtt-broker" unresolved locally; connecting to production MQTT broker', { brokerUrl });
    } else {
      const has1884 = await isPortOpen(1884);
      const has1883 = await isPortOpen(1883);

      if (has1884) {
        brokerUrl = 'mqtt://127.0.0.1:1884';
        logger.info('Using local Docker Mosquitto', { brokerUrl });
      } else if (has1883) {
        brokerUrl = 'mqtt://127.0.0.1:1883';
        logger.info('Using local MQTT broker', { brokerUrl });
      } else {
        logger.info('No external MQTT broker detected; starting embedded Aedes broker on 1883');
        await startEmbeddedBroker(1883);
        brokerUrl = 'mqtt://127.0.0.1:1883';
      }
    }
  }

  return brokerUrl;
}

function subscribeAll() {
  SUBSCRIPTIONS.forEach(({ topic, description }) => {
    context.client.subscribe(topic, (err) => {
      if (err) {
        logger.error(`Error subscribing to ${description}`, { error: err.message });
      } else {
        logger.debug(`Subscribed to ${description}`);
      }
    });
  });
}

/**
 * Connect to the MQTT broker and wire the message router.
 * @param {(topic: string, message: Buffer) => void} onMessage
 * @returns {Promise<void>}
 */
async function connectBroker(onMessage) {
  const brokerUrl = await resolveBrokerUrl();
  const options = {
    clientId: `home-automation-server-${Math.random().toString(16).substring(2, 10)}`,
    username: process.env.MQTT_USERNAME,
    password: process.env.MQTT_PASSWORD,
    clean: true,
    reconnectPeriod: 5000
  };

  context.client = mqtt.connect(brokerUrl, options);

  context.client.on('connect', () => {
    logger.info('Connected to MQTT broker');
    subscribeAll();
  });

  context.client.on('error', (err) => {
    logger.error('MQTT error', { error: err.message });
  });

  context.client.on('reconnect', () => {
    logger.info('Reconnecting to MQTT broker...');
  });

  if (onMessage) {
    context.client.on('message', onMessage);
  }
}

/**
 * Close the MQTT connection and clear ESP mappings.
 */
function close() {
  if (context.client) {
    context.client.end();
    logger.info('MQTT connection closed');
  }

  context.espRoomMappings.clear();
  context.roomEspConnections.clear();
}

module.exports = { connectBroker, close, isPortOpen, startEmbeddedBroker };