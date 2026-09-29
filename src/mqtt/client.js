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
let embeddedBroker = null;

// How long to wait for the broker's CONNACK before giving up on a connection.
const CONNECT_TIMEOUT_MS = 10000;

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
  let aedesInstance = null;
  try {
    const { Aedes } = require('aedes');
    aedesInstance = new Aedes({
      authenticate: (client, username, password, callback) => {
        callback(null, true); // Authenticate all local connections
      }
    });

    // Aedes 1.x keeps itself `closed` until listen() is awaited. Without this the
    // broker accepts the TCP connection, never processes the CONNECT packet, and
    // every client then fails with "connack timeout" — the port looks open and the
    // stack looks healthy while MQTT is entirely dead. Verified against aedes
    // 1.1.1 and 1.2.0 on Node 22.
    await aedesInstance.listen();

    const server = net.createServer(aedesInstance.handle);
    await new Promise((resolve, reject) => {
      server.listen(port, () => {
        logger.info(`Started embedded local MQTT broker (Aedes) on 127.0.0.1:${port}`);
        resolve();
      });
      server.on('error', reject);
    });
    embeddedBrokerServer = server;
    embeddedBroker = aedesInstance;

    // Prove the broker actually completes a handshake before declaring success,
    // so a broken broker can never masquerade as a running one again.
    if (!(await verifyEmbeddedBroker(port))) {
      await stopEmbeddedBroker();
      logger.warn(`Embedded MQTT broker on port ${port} did not complete a handshake; treating as failed`);
      return false;
    }
    return true;
  } catch (err) {
    logger.warn(`Could not start embedded MQTT broker on port ${port}: ${err.message}`);
    await stopEmbeddedBroker();
    return false;
  }
}

/**
 * Confirm the embedded broker really answers an MQTT CONNECT.
 * @param {number} port
 * @returns {Promise<boolean>}
 */
function verifyEmbeddedBroker(port) {
  return new Promise((resolve) => {
    let settled = false;
    const done = (ok) => {
      if (settled) return;
      settled = true;
      try { probe.end(true); } catch { /* ignore */ }
      resolve(ok);
    };
    const probe = mqtt.connect(`mqtt://127.0.0.1:${port}`, {
      clientId: `embedded-broker-probe-${Date.now()}`,
      clean: true, connectTimeout: 5000, reconnectPeriod: 0,
    });
    probe.on('connect', () => { logger.debug('Embedded MQTT broker handshake verified'); done(true); });
    probe.on('error', (err) => {
      logger.warn('Embedded MQTT broker handshake failed', { error: err.message });
      done(false);
    });
    setTimeout(() => done(false), 7000).unref?.();
  });
}

/**
 * Tear down the embedded broker (socket + Aedes instance).
 */
async function stopEmbeddedBroker() {
  if (embeddedBrokerServer) {
    await new Promise((resolve) => embeddedBrokerServer.close(() => resolve()));
    embeddedBrokerServer = null;
  }
  if (embeddedBroker) {
    try { await embeddedBroker.close(); } catch { /* ignore */ }
    embeddedBroker = null;
  }
}

/**
 * Resolve the effective broker URL, falling back gracefully.
 * @returns {Promise<string>}
 *
 * Note: a port-open check only proves something is listening, not that we can
 * actually use it. A broker that rejects our credentials is still "reachable",
 * so a reachable production host is preferred and the failure surfaces later as
 * a CONNACK error rather than a fallback. connectBroker now reports that
 * failure instead of returning success.
 */
async function resolveBrokerUrl() {
  const brokerUrl = process.env.MQTT_BROKER_URL || 'mqtt://localhost:1883';

  const host = (() => {
    try { return new URL(brokerUrl).hostname; } catch { return 'localhost'; }
  })();
  const port = (() => {
    try {
      const p = new URL(brokerUrl).port;
      return p ? parseInt(p, 10) : 1883;
    } catch { return 1883; }
  })();

  // Always prefer the configured broker when it actually answers. "mqtt-broker"
  // is the Docker Compose service name, so inside Compose it resolves and is the
  // correct in-network broker. The old check keyed off the *string* containing
  // "mqtt-broker" and therefore hijacked a perfectly good Compose URL, either
  // hairpinning out to the public IP or starting a broken embedded broker.
  if (await isPortOpen(port, host)) {
    return brokerUrl;
  }

  // Only reach for fallbacks when the configured broker is genuinely unreachable,
  // which in practice means running outside Docker.
  if (host === 'mqtt-broker') {
    const prodHost = process.env.MQTT_PRODUCTION_BROKER_HOST || '88.222.220.235';
    const prodPort = parseInt(process.env.MQTT_PRODUCTION_BROKER_PORT || '1884', 10);
    if (await isPortOpen(prodPort, prodHost)) {
      logger.info('Broker "mqtt-broker" unreachable; falling back to production MQTT broker', {
        brokerUrl: `mqtt://${prodHost}:${prodPort}`,
      });
      return `mqtt://${prodHost}:${prodPort}`;
    }

    if (await isPortOpen(1884)) {
      logger.info('Using local Docker Mosquitto', { brokerUrl: 'mqtt://127.0.0.1:1884' });
      return 'mqtt://127.0.0.1:1884';
    }
    if (await isPortOpen(1883)) {
      logger.info('Using local MQTT broker', { brokerUrl: 'mqtt://127.0.0.1:1883' });
      return 'mqtt://127.0.0.1:1883';
    }

    logger.info('No external MQTT broker detected; starting embedded Aedes broker on 1883');
    const started = await startEmbeddedBroker(1883);
    if (!started) {
      logger.error('No MQTT broker available and the embedded broker failed to start');
    }
    return 'mqtt://127.0.0.1:1883';
  }

  logger.warn('Configured MQTT broker is unreachable; continuing anyway', { brokerUrl });
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

  // Register every handler synchronously, before the CONNACK can arrive.
  // Attaching the subscribeAll() listener after awaiting the handshake would
  // miss the very first 'connect' event, leaving the client connected but with
  // zero subscriptions (no messages ever delivered).
  let settleConnect;
  const handshake = new Promise((resolve) => { settleConnect = resolve; });

  let settled = false;
  const settle = (ok, reason) => {
    if (settled) return;
    settled = true;
    settleConnect({ ok, reason });
  };

  context.client.on('connect', () => {
    logger.info('Connected to MQTT broker');
    subscribeAll();
    settle(true, null);
  });

  context.client.on('error', (err) => {
    logger.error('MQTT error', { error: err.message });
    settle(false, err.message);
  });

  context.client.on('reconnect', () => {
    logger.info('Reconnecting to MQTT broker...');
  });

  if (onMessage) {
    context.client.on('message', onMessage);
  }

  // Wait for the CONNACK instead of returning as soon as the socket is created.
  // mqtt.connect() returns long before the broker has authenticated us, so
  // returning here reported success for a broker that then failed every
  // subscribe with "Not authorized" — the caller had no way to know MQTT was
  // dead. This makes the caller wait up to CONNECT_TIMEOUT_MS for a real
  // CONNACK (or a definite auth failure).
  const connectTimer = setTimeout(
    () => settle(false, `timed out after ${CONNECT_TIMEOUT_MS}ms`),
    CONNECT_TIMEOUT_MS
  );
  connectTimer.unref?.();

  const connected = await handshake;
  clearTimeout(connectTimer);

  if (!connected.ok) {
    logger.error('MQTT connection failed', { brokerUrl, reason: connected.reason });
    try { context.client.end(true); } catch { /* ignore */ }
    context.client = null;
    return false;
  }

  return true;
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

  if (embeddedBrokerServer || embeddedBroker) {
    stopEmbeddedBroker().catch(() => { /* ignore */ });
  }
}

module.exports = { connectBroker, close, isPortOpen, startEmbeddedBroker, stopEmbeddedBroker };