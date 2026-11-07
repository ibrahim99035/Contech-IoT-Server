/**
 * Socket.IO + MQTT status-switch verification.
 *
 * Boots the real Express + Socket.IO + MQTT stack against a throwaway local
 * MongoDB and a real Mosquitto broker, then drives the status-switch paths from
 * every direction:
 *
 *   /ws/user update-state / update-state-mqtt / update-room-devices-mqtt
 *   /ws/room-user update-room-devices
 *   /ws/device report-state
 *   /ws/room-esp update-room-devices
 *   /ws/mqtt-bridge report-state / report-room-state
 *   MQTT inbound device state/status, room state, ESP auth/compact/disconnect
 *
 * The MQTT observer records every broker message, so tests can prove that a
 * socket action actually produced the expected topic/payload, not just that the
 * socket handler returned an ack.
 *
 * Usage:
 *   node test/run-sockets-mqtt.js
 *
 * Requires Mosquitto on 127.0.0.1:1895 and Mongo replica set rs0 on 27019.
 */

'use strict';

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const mongoose = require('mongoose');
const jwt = require('jsonwebtoken');
const mqtt = require('mqtt');
const { io: ioc } = require('socket.io-client');

const PORT = 5097;
const MONGO = process.env.MONGODB_URI || 'mongodb://127.0.0.1:27019/contech_socket_mqtt_test';
const JWT_SECRET = 'socket_mqtt_test_secret';
const BROKER = process.env.MQTT_BROKER_URL || 'mqtt://127.0.0.1:1895';
const BROKER_HOST = (() => {
  try { return new URL(BROKER.replace(/^mqtts:/, 'https:').replace(/^mqtt:/, 'http:')).hostname; }
  catch { return '127.0.0.1'; }
})();
const BROKER_PORT = (() => {
  try {
    const u = new URL(BROKER.replace(/^mqtts:/, 'https:').replace(/^mqtt:/, 'http:'));
    return Number(u.port || (BROKER.startsWith('mqtts:') ? 8883 : 1883));
  } catch { return 1895; }
})();

process.env.MONGODB_URI = MONGO;
process.env.JWT_SECRET = JWT_SECRET;
process.env.PORT = String(PORT);
process.env.NODE_ENV = 'test';
process.env.SCHEDULER_ENABLED = 'false';
process.env.MQTT_BROKER_URL = BROKER;
process.env.MQTT_ENABLED = 'true';
// Local Mosquitto is anonymous. Do not inherit production credentials from the
// shell into this local-only run.
delete process.env.MQTT_USERNAME;
delete process.env.MQTT_PASSWORD;

const { startServer, stopServer } = require('./lib/bootstrap');
const User = require('../src/models/User');
const Apartment = require('../src/models/Apartment');
const Room = require('../src/models/Room');
const Device = require('../src/models/Device');
const mqttBroker = require('../src/mqtt/mqtt-broker');
const schedulerService = require('../src/services/schedulerService');

const sha256 = (v) => crypto.createHash('sha256').update(String(v)).digest('hex');
const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

let passed = 0;
let failed = 0;
const results = [];
const notes = [];

function section(name) {
  results.push('', `## ${name}`);
}

function record(name, ok, detail = '') {
  ok ? passed++ : failed++;
  results.push(`${ok ? '✅' : '❌'} [${name}] ${detail}`.trim());
}

function note(message) {
  notes.push(message);
  results.push(`ℹ️ [note] ${message}`);
}

function topic(deviceId) {
  return `home-automation/${deviceId}/state`;
}

function statusTopic(deviceId) {
  return `home-automation/${deviceId}/status`;
}

function roomTopic(roomId) {
  return `home-automation/room/${roomId}/state`;
}

function espStateTopic(roomId) {
  return `home-automation/esp/room/${roomId}/state-update`;
}

function espBulkTopic(roomId) {
  return `home-automation/esp/room/${roomId}/bulk-update`;
}

function espAuthResponseTopic(espId) {
  return `home-automation/esp/${espId}/auth/response`;
}

function espCompactResponseTopic(espId) {
  return `home-automation/esp/${espId}/compact-state/response`;
}

function espAuthTopic(espId) {
  return `home-automation/esp/${espId}/auth`;
}

function espCompactTopic(espId) {
  return `home-automation/esp/${espId}/compact-state`;
}

function espDisconnectTopic(espId) {
  return `home-automation/esp/${espId}/disconnect`;
}

// ── Socket.IO helper ────────────────────────────────────────────────────────

function connect(ns, query = {}, auth = {}, ms = 6000) {
  return new Promise((resolve) => {
    const sock = ioc(`http://127.0.0.1:${PORT}${ns}`, {
      query,
      auth,
      transports: ['websocket'],
      reconnection: false,
      timeout: ms,
      forceNew: true,
    });

    sock.__events = [];
    sock.onAny((event, payload) => {
      sock.__events.push({ event, payload, ts: Date.now() });
    });

    let settled = false;
    const settle = (ok, err) => {
      if (settled) return;
      settled = true;
      resolve({ sock, ok, err, events: sock.__events });
    };

    sock.on('connect', () => settle(true));
    sock.on('connect_error', (err) => {
      try { sock.close(); } catch { /* ignore */ }
      settle(false, err.message);
    });
    setTimeout(() => {
      if (!settled) {
        try { sock.close(); } catch { /* ignore */ }
        settle(false, 'timeout');
      }
    }, ms);
  });
}

async function waitForEvent(sock, event, predicate = () => true, ms = 5000, since = Date.now()) {
  const deadline = Date.now() + ms;
  while (Date.now() <= deadline) {
    const found = (sock.__events || []).find((r) =>
      r.ts >= since && r.event === event && predicate(r.payload)
    );
    if (found) return found;
    await delay(25);
  }
  return null;
}

function eventCount(sock, event, predicate = () => true, since = 0) {
  return (sock.__events || []).filter((r) =>
    r.ts >= since && r.event === event && predicate(r.payload)
  ).length;
}

async function waitForDb(fn, predicate, ms = 5000) {
  const deadline = Date.now() + ms;
  while (Date.now() <= deadline) {
    const value = await fn();
    if (predicate(value)) return value;
    await delay(50);
  }
  return null;
}

function probeRetained(topicName, predicate = () => true, ms = 6000) {
  return new Promise((resolve) => {
    const probe = mqtt.connect(BROKER, {
      clientId: `retained-probe-${Date.now()}-${Math.random().toString(16).slice(2)}`,
      clean: true,
      reconnectPeriod: 0,
      connectTimeout: 8000,
    });
    const finish = (value) => {
      clearTimeout(timer);
      try { probe.end(true); } catch { /* ignore */ }
      resolve(value);
    };
    const timer = setTimeout(() => finish(null), ms);
    probe.once('connect', () => {
      probe.subscribe(topicName, { qos: 1 }, () => { /* wait for retained message */ });
    });
    probe.on('message', (t, payload, packet) => {
      if (t !== topicName) return;
      let parsed;
      try { parsed = JSON.parse(payload.toString()); } catch { parsed = null; }
      if (!predicate(parsed)) return;
      finish({ parsed, retain: Boolean(packet && packet.retain), raw: payload.toString() });
    });
    probe.once('error', () => finish(null));
  });
}

// ── MQTT observer ───────────────────────────────────────────────────────────

class MqttRecorder {
  constructor(url) {
    this.url = url;
    this.client = null;
    this.messages = [];
  }

  async start() {
    this.client = mqtt.connect(this.url, {
      clientId: `mqtt-recorder-${Date.now()}`,
      clean: true,
      reconnectPeriod: 0,
      connectTimeout: 8000,
    });

    await new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error('broker connect timeout')), 9000);
      this.client.once('connect', () => { clearTimeout(timer); resolve(); });
      this.client.once('error', (err) => { clearTimeout(timer); reject(err); });
    });

    this.client.on('message', (t, payload, packet) => {
      let parsed;
      try { parsed = JSON.parse(payload.toString()); } catch { parsed = payload.toString(); }
      this.messages.push({
        topic: t,
        payload: parsed,
        raw: payload.toString(),
        retain: Boolean(packet && packet.retain),
        qos: packet && packet.qos,
        ts: Date.now(),
      });
    });

    await new Promise((resolve, reject) => {
      this.client.subscribe('#', { qos: 1 }, (err) => (err ? reject(err) : resolve()));
    });
  }

  clear() {
    this.messages.length = 0;
  }

  waitFor(topicName, predicate = () => true, ms = 5000, since = Date.now()) {
    const deadline = Date.now() + ms;
    return (async () => {
      while (Date.now() <= deadline) {
        const found = this.messages.find((m) =>
          m.ts >= since && m.topic === topicName && predicate(m)
        );
        if (found) return found;
        await delay(25);
      }
      return null;
    })();
  }

  count(topicName, predicate = () => true, since = 0) {
    return this.messages.filter((m) =>
      m.ts >= since && m.topic === topicName && predicate(m)
    ).length;
  }

  publish(topicName, payload, options = {}) {
    return new Promise((resolve, reject) => {
      this.client.publish(topicName, payload, { qos: 1, ...options }, (err) => (err ? reject(err) : resolve()));
    });
  }

  async end() {
    if (!this.client) return;
    await new Promise((resolve) => this.client.end(false, {}, resolve));
    this.client = null;
  }
}

// ── Fixtures ────────────────────────────────────────────────────────────────

async function createDevice({ name, type, room, creator, order, raw, users }) {
  const device = await Device.create({
    name,
    type,
    room: room._id,
    creator,
    order,
    componentNumber: `placeholder-${raw}`,
    status: 'off',
    users,
  });
  device.componentNumber = sha256(raw);
  await device.save();
  return device;
}

async function main() {
  // Fail fast if the broker is not a real one. The embedded Aedes fallback
  // accepts TCP but does not complete CONNACK on this Node version.
  const { isPortOpen } = require('../src/mqtt/client');
  if (!(await isPortOpen(BROKER_PORT, BROKER_HOST))) {
    throw new Error(`No MQTT broker at ${BROKER}. Start Mosquitto on 127.0.0.1:1895.`);
  }

  await startServer({ httpPort: PORT, mongoUri: MONGO });
  await Promise.all([
    User.deleteMany({}),
    Apartment.deleteMany({}),
    Room.deleteMany({}),
    Device.deleteMany({}),
  ]);

  const user = await User.create({
    name: 'MQTT User',
    email: `mqtt-${Date.now()}@test.com`,
    password: 'TestPass123!',
    role: 'customer',
    active: true,
  });
  const other = await User.create({
    name: 'MQTT Other',
    email: `mqtt-other-${Date.now()}@test.com`,
    password: 'TestPass123!',
    role: 'customer',
    active: true,
  });
  const token = jwt.sign({ id: user._id.toString(), role: 'customer' }, JWT_SECRET, { expiresIn: '1h' });
  const otherToken = jwt.sign({ id: other._id.toString(), role: 'customer' }, JWT_SECRET, { expiresIn: '1h' });

  const apartment = await Apartment.create({
    name: 'MQTT Test Apt',
    creator: user._id,
    members: [user._id],
  });
  const room1 = await Room.create({
    name: 'MQTT Room 1',
    apartment: apartment._id,
    creator: user._id,
    users: [user._id],
    roomPassword: 'RoomPass123!',
  });
  const room2 = await Room.create({
    name: 'MQTT Room 2',
    apartment: apartment._id,
    creator: user._id,
    users: [user._id],
    roomPassword: 'RoomPass456!',
  });

  const d1 = await createDevice({
    name: 'MQTT Light 1', type: 'Light', room: room1, creator: user._id,
    order: 1, raw: 'mqtt-dev-1', users: [user._id],
  });
  const d2 = await createDevice({
    name: 'MQTT Fan 2', type: 'Fan', room: room1, creator: user._id,
    order: 2, raw: 'mqtt-dev-2', users: [user._id],
  });
  const d3 = await createDevice({
    name: 'MQTT Light 3', type: 'Light', room: room2, creator: user._id,
    order: 1, raw: 'mqtt-dev-3', users: [user._id],
  });

  const ids = {
    user: user._id.toString(),
    other: other._id.toString(),
    apartment: apartment._id.toString(),
    room1: room1._id.toString(),
    room2: room2._id.toString(),
    d1: d1._id.toString(),
    d2: d2._id.toString(),
    d3: d3._id.toString(),
  };
  const raw = {
    d1: 'mqtt-dev-1',
    d2: 'mqtt-dev-2',
    d3: 'mqtt-dev-3',
  };

  // Wait for the server's own MQTT client to finish CONNACK + subscribe.
  for (let i = 0; i < 120; i++) {
    if (mqttBroker.client && mqttBroker.client.connected) break;
    await delay(100);
  }
  record('mqtt: server client connected to the test broker',
    Boolean(mqttBroker.client && mqttBroker.client.connected),
    mqttBroker.client && mqttBroker.client.connected ? BROKER : 'not connected');

  const recorder = new MqttRecorder(BROKER);
  await recorder.start();
  record('mqtt: observer subscribed to #', true, BROKER);
  recorder.clear();

  // ── Handshake rejection ─────────────────────────────────────────────────
  section('Handshake rejection');
  let r = await connect('/ws/user', {});
  record('user ns: no token rejected', !r.ok, r.ok ? 'CONNECTED (should not)' : r.err);

  r = await connect('/ws/user', { token: 'garbage' });
  record('user ns: bad token rejected', !r.ok, r.ok ? 'CONNECTED (should not)' : r.err);

  r = await connect('/ws/device', { componentNumber: 'does-not-exist' });
  record('device ns: bad componentNumber rejected', !r.ok, r.ok ? 'CONNECTED (should not)' : r.err);

  r = await connect('/ws/room-esp', { componentNumber: 'does-not-exist' });
  record('room-esp ns: bad componentNumber rejected', !r.ok, r.ok ? 'CONNECTED (should not)' : r.err);

  r = await connect('/ws/mqtt-bridge', { roomId: ids.room1, deviceOrder: '1' });
  record('mqtt-bridge ns: missing room password rejected', !r.ok, r.ok ? 'CONNECTED (should not)' : r.err);

  r = await connect('/ws/mqtt-bridge', { roomId: ids.room1, deviceOrder: '1', roomPassword: 'wrong' });
  record('mqtt-bridge ns: wrong room password rejected', !r.ok, r.ok ? 'CONNECTED (should not)' : r.err);

  r = await connect('/ws/mqtt-bridge', { roomId: ids.room1, deviceOrder: '9', roomPassword: 'RoomPass123!' });
  record('mqtt-bridge ns: invalid device order rejected', !r.ok, r.ok ? 'CONNECTED (should not)' : r.err);

  // ── Valid connections ───────────────────────────────────────────────────
  section('Valid namespace connections');
  const userSock = await connect('/ws/user', {}, { token });
  record('user ns: valid token connects', userSock.ok, userSock.ok ? 'connected' : userSock.err);

  const otherSock = await connect('/ws/user', {}, { token: otherToken });
  record('user ns: second valid user connects', otherSock.ok, otherSock.ok ? 'connected' : otherSock.err);

  const roomUserSock = await connect('/ws/room-user', {}, { token });
  record('room-user ns: valid token connects', roomUserSock.ok, roomUserSock.ok ? 'connected' : roomUserSock.err);

  const deviceSock = await connect('/ws/device', { componentNumber: raw.d1 });
  record('device ns: valid componentNumber connects', deviceSock.ok, deviceSock.ok ? 'connected' : deviceSock.err);

  const roomEspSock = await connect('/ws/room-esp', { componentNumber: raw.d2 });
  record('room-esp ns: valid componentNumber connects', roomEspSock.ok, roomEspSock.ok ? 'connected' : roomEspSock.err);

  // Let the async joinUser* helpers finish before relying on room broadcasts.
  await delay(500);

  // ── Initial state ───────────────────────────────────────────────────────
  section('Initial state');
  {
    const since = Date.now();
    userSock.sock.emit('get-device-esp-status', { deviceId: ids.d1 });
    const ev = await waitForEvent(userSock.sock, 'device-esp-status-response', (p) => p && p.deviceId === ids.d1, 4000, since);
    record('user ns: device ESP status starts false', Boolean(ev && ev.payload.espConnected === false),
      ev ? `espConnected=${ev.payload.espConnected}` : 'no response');
  }
  {
    const since = Date.now();
    roomUserSock.sock.emit('get-esp-status', { roomId: ids.room1 });
    const ev = await waitForEvent(roomUserSock.sock, 'esp-status-response', (p) => p && p.roomId === ids.room1, 4000, since);
    record('room-user ns: room ESP status starts false', Boolean(ev && ev.payload.espConnected === false),
      ev ? `espConnected=${ev.payload.espConnected}` : 'no response');
  }

  // ── 1. /ws/user update-state ─────────────────────────────────────────────
  section('1. /ws/user update-state');
  {
    await Device.findByIdAndUpdate(ids.d1, { status: 'off' });
    userSock.sock.__events.length = 0;
    deviceSock.sock.__events.length = 0;
    roomUserSock.sock.__events.length = 0;
    recorder.clear();

    const since = Date.now();
    userSock.sock.emit('update-state', { deviceId: ids.d1, state: 'on' });

    const userEcho = await waitForEvent(userSock.sock, 'state-updated',
      (p) => p && p.deviceId === ids.d1 && p.updatedBy === 'user', 5000, since);
    const deviceCmd = await waitForEvent(deviceSock.sock, 'state-update',
      (p) => p && p.state === 'on', 5000, since);
    const roomEcho = await waitForEvent(roomUserSock.sock, 'room-devices-updated',
      (p) => p && p.roomId === ids.room1 && p.updatedBy === 'user', 5000, since);
    const mqttState = await recorder.waitFor(topic(ids.d1),
      (m) => m.payload && m.payload.state === 'on' && m.payload.updatedBy === 'user', 5000, since);
    const mqttEsp = await recorder.waitFor(espStateTopic(ids.room1),
      (m) => m.payload && m.payload.deviceId === ids.d1 && m.payload.state === 'on', 5000, since);

    const persisted = await waitForDb(() => Device.findById(ids.d1), (d) => d && d.status === 'on');
    record('user update-state: DB persisted', Boolean(persisted), persisted ? `status=${persisted.status}` : 'not persisted');
    record('user update-state: /ws/user echo', Boolean(userEcho), userEcho ? JSON.stringify(userEcho.payload) : 'no event');
    record('user update-state: /ws/device command', Boolean(deviceCmd), deviceCmd ? JSON.stringify(deviceCmd.payload) : 'no event');
    record('user update-state: /ws/room-user echo arrives', Boolean(roomEcho), roomEcho ? JSON.stringify(roomEcho.payload) : 'no event');
    record('user update-state: MQTT device state published', Boolean(mqttState), mqttState ? mqttState.raw : 'no message');
    record('user update-state: MQTT ESP state-update published', Boolean(mqttEsp), mqttEsp ? mqttEsp.raw : 'no message');

    await delay(1200);
    const userEchoCount = eventCount(userSock.sock, 'state-updated',
      (p) => p && p.deviceId === ids.d1, since);
    const espCmdCount = recorder.count(espStateTopic(ids.room1),
      (m) => m.payload && m.payload.deviceId === ids.d1, since);
    record('user update-state: exactly one /ws/user state-updated (no self-echo duplicate)',
      userEchoCount === 1, `count=${userEchoCount}`);
    record('user update-state: exactly one MQTT ESP state-update (no duplicate command)',
      espCmdCount === 1, `count=${espCmdCount}`);
    if (userEchoCount !== 1 || espCmdCount !== 1) {
      note(`user update-state produced ${userEchoCount} /ws/user state-updated event(s) and ${espCmdCount} ESP MQTT command(s); the MQTT self-subscription appears to replay the server's own publish.`);
    }
  }

  // ── 2. /ws/user update-state-mqtt ───────────────────────────────────────
  section('2. /ws/user update-state-mqtt');
  {
    await Device.findByIdAndUpdate(ids.d1, { status: 'off' });
    userSock.sock.__events.length = 0;
    recorder.clear();

    const since = Date.now();
    userSock.sock.emit('update-state-mqtt', { deviceId: ids.d1, state: 'on' });

    const ack = await waitForEvent(userSock.sock, 'mqtt-state-update-sent',
      (p) => p && p.deviceId === ids.d1 && p.state === 'on', 4000, since);
    const mqttState = await recorder.waitFor(topic(ids.d1),
      (m) => m.payload && m.payload.state === 'on' && m.payload.updatedBy === 'user', 5000, since);
    const persisted = await waitForDb(() => Device.findById(ids.d1), (d) => d && d.status === 'on', 6000);
    const userEcho = await waitForEvent(userSock.sock, 'state-updated',
      (p) => p && p.deviceId === ids.d1 && p.updatedBy === 'mqtt', 6000, since);
    const mqttEsp = await recorder.waitFor(espStateTopic(ids.room1),
      (m) => m.payload && m.payload.deviceId === ids.d1, 5000, since);

    record('update-state-mqtt: ack sent', Boolean(ack), ack ? JSON.stringify(ack.payload) : 'no ack');
    record('update-state-mqtt: MQTT device state published', Boolean(mqttState), mqttState ? mqttState.raw : 'no message');
    record('update-state-mqtt: DB updated through self-echo', Boolean(persisted), persisted ? `status=${persisted.status}` : 'not persisted');
    record('update-state-mqtt: /ws/user state-updated from mqtt', Boolean(userEcho), userEcho ? JSON.stringify(userEcho.payload) : 'no event');
    record('update-state-mqtt: ESP state-update published', Boolean(mqttEsp), mqttEsp ? mqttEsp.raw : 'no message');

    await delay(800);
    const espCount = recorder.count(espStateTopic(ids.room1),
      (m) => m.payload && m.payload.deviceId === ids.d1, since);
    record('update-state-mqtt: exactly one MQTT ESP state-update',
      espCount === 1, `count=${espCount}`);
  }

  // ── 3. /ws/user update-room-devices-mqtt ────────────────────────────────
  section('3. /ws/user update-room-devices-mqtt');
  {
    await Device.updateMany({ _id: { $in: [ids.d1, ids.d2] } }, { status: 'off' });
    userSock.sock.__events.length = 0;
    roomUserSock.sock.__events.length = 0;
    recorder.clear();

    const since = Date.now();
    userSock.sock.emit('update-room-devices-mqtt', {
      roomId: ids.room1,
      updates: [
        { deviceId: ids.d1, state: 'on' },
        { deviceId: ids.d2, state: 'on' },
      ],
    });

    const ack = await waitForEvent(userSock.sock, 'mqtt-room-update-sent',
      (p) => p && p.roomId === ids.room1 && p.updatesCount === 2, 4000, since);
    const mqttRoom = await recorder.waitFor(roomTopic(ids.room1),
      (m) => m.payload && Array.isArray(m.payload.updates) && m.payload.updates.length === 2, 5000, since);
    const persisted = await waitForDb(async () => {
      const ds = await Device.find({ _id: { $in: [ids.d1, ids.d2] } });
      return ds;
    }, (ds) => ds.length === 2 && ds.every((d) => d.status === 'on'), 6000);
    const roomEcho = await waitForEvent(roomUserSock.sock, 'room-devices-updated',
      (p) => p && p.roomId === ids.room1 && p.updatedBy === 'mqtt', 6000, since);
    const mqttBulk = await recorder.waitFor(espBulkTopic(ids.room1),
      (m) => m.payload && Array.isArray(m.payload.updates) && m.payload.updates.length === 2, 5000, since);

    record('update-room-devices-mqtt: ack sent', Boolean(ack), ack ? JSON.stringify(ack.payload) : 'no ack');
    record('update-room-devices-mqtt: MQTT room state published', Boolean(mqttRoom), mqttRoom ? mqttRoom.raw : 'no message');
    record('update-room-devices-mqtt: DB updated through self-echo', Boolean(persisted), persisted ? persisted.map((d) => d.status).join(',') : 'not persisted');
    record('update-room-devices-mqtt: /ws/room-user echo', Boolean(roomEcho), roomEcho ? JSON.stringify(roomEcho.payload) : 'no event');
    record('update-room-devices-mqtt: MQTT ESP bulk published', Boolean(mqttBulk), mqttBulk ? mqttBulk.raw : 'no message');

    await delay(800);
    const bulkCount = recorder.count(espBulkTopic(ids.room1),
      (m) => m.payload && Array.isArray(m.payload.updates) && m.payload.updates.length === 2, since);
    record('update-room-devices-mqtt: exactly one MQTT ESP bulk-update',
      bulkCount === 1, `count=${bulkCount}`);
  }

  // ── 4. /ws/room-user update-room-devices ────────────────────────────────
  section('4. /ws/room-user update-room-devices');
  {
    await Device.updateMany({ _id: { $in: [ids.d1, ids.d2] } }, { status: 'off' });
    userSock.sock.__events.length = 0;
    roomUserSock.sock.__events.length = 0;
    deviceSock.sock.__events.length = 0;
    roomEspSock.sock.__events.length = 0;
    recorder.clear();

    const since = Date.now();
    roomUserSock.sock.emit('update-room-devices', {
      roomId: ids.room1,
      updates: [
        { deviceId: ids.d1, state: 'on' },
        { deviceId: ids.d2, state: 'on' },
      ],
    });

    const ack = await waitForEvent(roomUserSock.sock, 'room-update-results',
      (p) => p && Array.isArray(p.results) && p.results.length === 2 && p.results.every((x) => x.success), 5000, since);
    const userEcho = await waitForEvent(userSock.sock, 'state-updated',
      (p) => p && p.deviceId === ids.d1 && p.updatedBy === 'user', 5000, since);
    const deviceCmd = await waitForEvent(deviceSock.sock, 'state-update',
      (p) => p && p.state === 'on' && p.updatedBy === 'user', 5000, since);
    const roomEspCmd = await waitForEvent(roomEspSock.sock, 'room-state-changed',
      (p) => p && p.roomId === ids.room1, 5000, since);
    const mqttRoom = await recorder.waitFor(roomTopic(ids.room1),
      (m) => m.payload && Array.isArray(m.payload.updates) && m.payload.updates.length === 2, 5000, since);
    const mqttBulk = await recorder.waitFor(espBulkTopic(ids.room1),
      (m) => m.payload && Array.isArray(m.payload.updates) && m.payload.updates.length === 2, 5000, since);
    const persisted = await waitForDb(async () => Device.find({ _id: { $in: [ids.d1, ids.d2] } }),
      (ds) => ds.length === 2 && ds.every((d) => d.status === 'on'), 6000);

    record('room-user update: per-device results ack', Boolean(ack), ack ? JSON.stringify(ack.payload) : 'no ack');
    record('room-user update: /ws/user echo', Boolean(userEcho), userEcho ? JSON.stringify(userEcho.payload) : 'no event');
    record('room-user update: /ws/device command', Boolean(deviceCmd), deviceCmd ? JSON.stringify(deviceCmd.payload) : 'no event');
    record('room-user update: /ws/room-esp command', Boolean(roomEspCmd), roomEspCmd ? JSON.stringify(roomEspCmd.payload) : 'no event');
    record('room-user update: MQTT room state published', Boolean(mqttRoom), mqttRoom ? mqttRoom.raw : 'no message');
    record('room-user update: MQTT ESP bulk published', Boolean(mqttBulk), mqttBulk ? mqttBulk.raw : 'no message');
    record('room-user update: DB persisted', Boolean(persisted), persisted ? persisted.map((d) => d.status).join(',') : 'not persisted');

    await delay(1000);
    const roomEventCount = eventCount(roomUserSock.sock, 'room-devices-updated',
      (p) => p && p.roomId === ids.room1, since);
    const bulkCount = recorder.count(espBulkTopic(ids.room1),
      (m) => m.payload && Array.isArray(m.payload.updates) && m.payload.updates.length === 2, since);
    record('room-user update: exactly one room-devices-updated (no self-echo duplicate)',
      roomEventCount === 1, `count=${roomEventCount}`);
    record('room-user update: exactly one MQTT ESP bulk (no duplicate command)',
      bulkCount === 1, `count=${bulkCount}`);
    if (roomEventCount !== 1 || bulkCount !== 1) {
      note(`room-user update produced ${roomEventCount} room-devices-updated event(s) and ${bulkCount} ESP bulk command(s); the MQTT self-subscription appears to replay the server's own publish.`);
    }
  }

  // ── 5. /ws/device report-state ──────────────────────────────────────────
  section('5. /ws/device report-state');
  {
    await Device.findByIdAndUpdate(ids.d1, { status: 'off' });
    userSock.sock.__events.length = 0;
    roomUserSock.sock.__events.length = 0;
    deviceSock.sock.__events.length = 0;
    roomEspSock.sock.__events.length = 0;
    recorder.clear();

    const since = Date.now();
    deviceSock.sock.emit('report-state', { state: 'on' });

    const ack = await waitForEvent(deviceSock.sock, 'state-reported',
      (p) => p && p.state === 'on', 4000, since);
    const userEcho = await waitForEvent(userSock.sock, 'state-update',
      (p) => p && p.deviceId === ids.d1 && p.updatedBy === 'device', 5000, since);
    const roomEcho = await waitForEvent(roomUserSock.sock, 'room-devices-updated',
      (p) => p && p.roomId === ids.room1 && p.updatedBy === 'device', 5000, since);
    const roomEspEcho = await waitForEvent(roomEspSock.sock, 'room-state-changed',
      (p) => p && p.roomId === ids.room1, 5000, since);
    const mqttState = await recorder.waitFor(topic(ids.d1),
      (m) => m.payload && m.payload.state === 'on' && m.payload.updatedBy === 'device', 5000, since);
    const mqttEsp = await recorder.waitFor(espStateTopic(ids.room1),
      (m) => m.payload && m.payload.deviceId === ids.d1 && m.payload.state === 'on', 5000, since);
    const persisted = await waitForDb(() => Device.findById(ids.d1), (d) => d && d.status === 'on');

    record('device report-state: ack sent', Boolean(ack), ack ? JSON.stringify(ack.payload) : 'no ack');
    record('device report-state: /ws/user state-update', Boolean(userEcho), userEcho ? JSON.stringify(userEcho.payload) : 'no event');
    record('device report-state: /ws/room-user event', Boolean(roomEcho), roomEcho ? JSON.stringify(roomEcho.payload) : 'no event');
    record('device report-state: /ws/room-esp event', Boolean(roomEspEcho), roomEspEcho ? JSON.stringify(roomEspEcho.payload) : 'no event');
    record('device report-state: MQTT device state published', Boolean(mqttState), mqttState ? mqttState.raw : 'no message');
    record('device report-state: MQTT ESP state-update published', Boolean(mqttEsp), mqttEsp ? mqttEsp.raw : 'no message');
    record('device report-state: DB persisted', Boolean(persisted), persisted ? `status=${persisted.status}` : 'not persisted');

    await delay(900);
    const userCount = eventCount(userSock.sock, 'state-update',
      (p) => p && p.deviceId === ids.d1, since);
    const mqttCount = recorder.count(topic(ids.d1),
      (m) => m.payload && m.payload.state === 'on', since);
    const espCount = recorder.count(espStateTopic(ids.room1),
      (m) => m.payload && m.payload.deviceId === ids.d1, since);
    record('device report-state: exactly one /ws/user event (no self-echo duplicate)',
      userCount === 1, `count=${userCount}`);
    record('device report-state: exactly one MQTT device state', mqttCount === 1, `count=${mqttCount}`);
    record('device report-state: exactly one MQTT ESP state-update', espCount === 1, `count=${espCount}`);
  }

  // ── 6. /ws/room-esp update-room-devices ─────────────────────────────────
  section('6. /ws/room-esp update-room-devices');
  {
    await Device.updateMany({ _id: { $in: [ids.d1, ids.d2] } }, { status: 'off' });
    userSock.sock.__events.length = 0;
    roomUserSock.sock.__events.length = 0;
    deviceSock.sock.__events.length = 0;
    recorder.clear();

    const since = Date.now();
    roomEspSock.sock.emit('update-room-devices', {
      updates: [
        { deviceId: ids.d1, state: 'on' },
        { deviceId: ids.d2, state: 'on' },
      ],
    });

    const ack = await waitForEvent(roomEspSock.sock, 'room-update-results',
      (p) => p && Array.isArray(p.results) && p.results.length === 2 && p.results.every((x) => x.success), 5000, since);
    const userEcho = await waitForEvent(userSock.sock, 'state-updated',
      (p) => p && p.deviceId === ids.d1 && p.updatedBy === 'esp', 5000, since);
    const deviceCmd = await waitForEvent(deviceSock.sock, 'state-update',
      (p) => p && p.state === 'on' && p.updatedBy === 'esp', 5000, since);
    const roomEcho = await waitForEvent(roomUserSock.sock, 'room-devices-updated',
      (p) => p && p.roomId === ids.room1 && p.updatedBy === 'esp', 5000, since);
    const mqttRoom = await recorder.waitFor(roomTopic(ids.room1),
      (m) => m.payload && Array.isArray(m.payload.updates) && m.payload.updates.length === 2, 5000, since);
    const mqttBulk = await recorder.waitFor(espBulkTopic(ids.room1),
      (m) => m.payload && Array.isArray(m.payload.updates) && m.payload.updates.length === 2, 5000, since);
    const persisted = await waitForDb(async () => Device.find({ _id: { $in: [ids.d1, ids.d2] } }),
      (ds) => ds.length === 2 && ds.every((d) => d.status === 'on'), 6000);

    record('room-esp update: per-device results ack', Boolean(ack), ack ? JSON.stringify(ack.payload) : 'no ack');
    record('room-esp update: /ws/user state-updated', Boolean(userEcho), userEcho ? JSON.stringify(userEcho.payload) : 'no event');
    record('room-esp update: /ws/device command', Boolean(deviceCmd), deviceCmd ? JSON.stringify(deviceCmd.payload) : 'no event');
    record('room-esp update: /ws/room-user event', Boolean(roomEcho), roomEcho ? JSON.stringify(roomEcho.payload) : 'no event');
    record('room-esp update: MQTT room state published', Boolean(mqttRoom), mqttRoom ? mqttRoom.raw : 'no message');
    record('room-esp update: MQTT ESP bulk published', Boolean(mqttBulk), mqttBulk ? mqttBulk.raw : 'no message');
    record('room-esp update: DB persisted', Boolean(persisted), persisted ? persisted.map((d) => d.status).join(',') : 'not persisted');

    await delay(900);
    const roomEventCount = eventCount(roomUserSock.sock, 'room-devices-updated',
      (p) => p && p.roomId === ids.room1, since);
    const mqttCount = recorder.count(roomTopic(ids.room1),
      (m) => m.payload && Array.isArray(m.payload.updates) && m.payload.updates.length === 2, since);
    const espCount = recorder.count(espBulkTopic(ids.room1),
      (m) => m.payload && Array.isArray(m.payload.updates) && m.payload.updates.length === 2, since);
    record('room-esp update: exactly one /ws/room-user event (no self-echo duplicate)',
      roomEventCount === 1, `count=${roomEventCount}`);
    record('room-esp update: exactly one MQTT room state', mqttCount === 1, `count=${mqttCount}`);
    record('room-esp update: exactly one MQTT ESP bulk', espCount === 1, `count=${espCount}`);
  }

  // ── 7. /ws/mqtt-bridge ──────────────────────────────────────────────────
  section('7. /ws/mqtt-bridge');
  {
    await Device.updateMany({ _id: { $in: [ids.d1, ids.d2] } }, { status: 'off' });
    userSock.sock.__events.length = 0;
    roomUserSock.sock.__events.length = 0;
    recorder.clear();

    const since = Date.now();
    const bridge = await connect('/ws/mqtt-bridge', {
      roomId: ids.room1,
      deviceOrder: '1',
      roomPassword: 'RoomPass123!',
    });
    record('mqtt-bridge ns: valid credentials connect', bridge.ok, bridge.ok ? 'connected' : bridge.err);

    const greet = await waitForEvent(bridge.sock, 'mqtt-bridge-connected',
      (p) => p && p.deviceId === ids.d1, 5000, since);
    const roomEvent = await waitForEvent(roomUserSock.sock, 'room-esp-status-updated',
      (p) => p && p.roomId === ids.room1 && p.espConnected === true, 5000, since);
    const mqttOnline = await recorder.waitFor(statusTopic(ids.d1),
      (m) => m.payload && m.payload.status === 'online', 5000, since);
    const roomDoc = await waitForDb(() => Room.findById(ids.room1), (room) => room && room.esp_component_connected === true);
    const onlineDevice = await waitForDb(() => Device.findById(ids.d1), (d) => d && d.isOnline === true);

    record('mqtt-bridge ns: greeting received', Boolean(greet), greet ? JSON.stringify(greet.payload) : 'no greeting');
    record('mqtt-bridge connect: /ws/room-user esp status true', Boolean(roomEvent), roomEvent ? JSON.stringify(roomEvent.payload) : 'no event');
    record('mqtt-bridge connect: MQTT status online published', Boolean(mqttOnline), mqttOnline ? mqttOnline.raw : 'no message');
    record('mqtt-bridge connect: Room.esp_component_connected persisted', Boolean(roomDoc), roomDoc ? `esp=${roomDoc.esp_component_connected}` : 'not persisted');
    record('mqtt-bridge connect: Device.isOnline persisted true', Boolean(onlineDevice), onlineDevice ? `isOnline=${onlineDevice.isOnline}` : 'not persisted');

    // The user namespace must now report the live ESP connection.
    {
      const s = Date.now();
      userSock.sock.emit('get-device-esp-status', { deviceId: ids.d1 });
      const ev = await waitForEvent(userSock.sock, 'device-esp-status-response',
        (p) => p && p.deviceId === ids.d1, 4000, s);
      record('mqtt-bridge connect: /ws/user sees espConnected=true', Boolean(ev && ev.payload.espConnected === true),
        ev ? `espConnected=${ev.payload.espConnected}` : 'no response');
    }

    // report-state publishes MQTT; the server's own subscription persists it.
    userSock.sock.__events.length = 0;
    recorder.clear();
    const reportSince = Date.now();
    bridge.sock.emit('report-state', { state: 'on' });
    const reportAck = await waitForEvent(bridge.sock, 'state-reported', (p) => p && p.success === true, 4000, reportSince);
    const reportMqtt = await recorder.waitFor(topic(ids.d1),
      (m) => m.payload && m.payload.state === 'on' && m.payload.updatedBy === 'device', 5000, reportSince);
    const reportDb = await waitForDb(() => Device.findById(ids.d1), (d) => d && d.status === 'on', 6000);
    const reportUser = await waitForEvent(userSock.sock, 'state-updated',
      (p) => p && p.deviceId === ids.d1 && p.updatedBy === 'mqtt', 6000, reportSince);
    const reportEsp = await recorder.waitFor(espStateTopic(ids.room1),
      (m) => m.payload && m.payload.deviceId === ids.d1 && m.payload.state === 'on', 5000, reportSince);

    record('mqtt-bridge report-state: ack sent', Boolean(reportAck), reportAck ? JSON.stringify(reportAck.payload) : 'no ack');
    record('mqtt-bridge report-state: MQTT device state published', Boolean(reportMqtt), reportMqtt ? reportMqtt.raw : 'no message');
    record('mqtt-bridge report-state: DB updated through self-echo', Boolean(reportDb), reportDb ? `status=${reportDb.status}` : 'not persisted');
    record('mqtt-bridge report-state: /ws/user state-updated', Boolean(reportUser), reportUser ? JSON.stringify(reportUser.payload) : 'no event');
    record('mqtt-bridge report-state: ESP state-update published', Boolean(reportEsp), reportEsp ? reportEsp.raw : 'no message');

    await delay(800);
    const reportEspCount = recorder.count(espStateTopic(ids.room1),
      (m) => m.payload && m.payload.deviceId === ids.d1, reportSince);
    record('mqtt-bridge report-state: exactly one ESP state-update',
      reportEspCount === 1, `count=${reportEspCount}`);

    // report-room-state publishes MQTT room state.
    userSock.sock.__events.length = 0;
    recorder.clear();
    const roomSince = Date.now();
    bridge.sock.emit('report-room-state', {
      roomId: ids.room1,
      updates: [
        { deviceId: ids.d1, state: 'off' },
        { deviceId: ids.d2, state: 'on' },
      ],
    });
    const roomAck = await waitForEvent(bridge.sock, 'room-state-reported', (p) => p && p.success === true, 4000, roomSince);
    const roomMqtt = await recorder.waitFor(roomTopic(ids.room1),
      (m) => m.payload && Array.isArray(m.payload.updates) && m.payload.updates.length === 2, 5000, roomSince);
    const roomDb = await waitForDb(async () => Device.find({ _id: { $in: [ids.d1, ids.d2] } }),
      (ds) => ds.length === 2 && ds.every((d) => d.status === (d._id.toString() === ids.d1 ? 'off' : 'on')), 6000);
    const roomBulk = await recorder.waitFor(espBulkTopic(ids.room1),
      (m) => m.payload && Array.isArray(m.payload.updates) && m.payload.updates.length === 2, 5000, roomSince);

    record('mqtt-bridge report-room-state: ack sent', Boolean(roomAck), roomAck ? JSON.stringify(roomAck.payload) : 'no ack');
    record('mqtt-bridge report-room-state: MQTT room state published', Boolean(roomMqtt), roomMqtt ? roomMqtt.raw : 'no message');
    record('mqtt-bridge report-room-state: DB updated through self-echo', Boolean(roomDb), roomDb ? roomDb.map((d) => d.status).join(',') : 'not persisted');
    record('mqtt-bridge report-room-state: ESP bulk published', Boolean(roomBulk), roomBulk ? roomBulk.raw : 'no message');

    await delay(800);
    const roomBulkCount = recorder.count(espBulkTopic(ids.room1),
      (m) => m.payload && Array.isArray(m.payload.updates) && m.payload.updates.length === 2, roomSince);
    record('mqtt-bridge report-room-state: exactly one ESP bulk',
      roomBulkCount === 1, `count=${roomBulkCount}`);

    // Disconnect must clear the room ESP flag.
    roomUserSock.sock.__events.length = 0;
    const disconnectSince = Date.now();
    bridge.sock.close();
    const offlineEvent = await waitForEvent(roomUserSock.sock, 'room-esp-status-updated',
      (p) => p && p.roomId === ids.room1 && p.espConnected === false, 5000, disconnectSince);
    const offlineDoc = await waitForDb(() => Room.findById(ids.room1), (room) => room && room.esp_component_connected === false);
    const offlineStatus = await recorder.waitFor(statusTopic(ids.d1),
      (m) => m.payload && m.payload.status === 'offline', 5000, disconnectSince);
    const offlineDevice = await waitForDb(() => Device.findById(ids.d1), (d) => d && d.isOnline === false);
    const retainedOffline = await probeRetained(statusTopic(ids.d1),
      (p) => p && p.status === 'offline');

    record('mqtt-bridge disconnect: /ws/room-user esp status false', Boolean(offlineEvent), offlineEvent ? JSON.stringify(offlineEvent.payload) : 'no event');
    record('mqtt-bridge disconnect: Room.esp_component_connected false', Boolean(offlineDoc), offlineDoc ? `esp=${offlineDoc.esp_component_connected}` : 'not persisted');
    record('mqtt-bridge disconnect: MQTT status offline published', Boolean(offlineStatus), offlineStatus ? offlineStatus.raw : 'no message');
    record('mqtt-bridge disconnect: Device.isOnline persisted false', Boolean(offlineDevice), offlineDevice ? `isOnline=${offlineDevice.isOnline}` : 'not persisted');
    record('mqtt-bridge disconnect: retained status offline', Boolean(retainedOffline && retainedOffline.retain),
      retainedOffline ? `retain=${retainedOffline.retain}, raw=${retainedOffline.raw}` : 'no retained message');
  }

  // ── 8. Inbound MQTT device state / status / room state ───────────────────
  section('8. Inbound MQTT device state, status, and room state');
  {
    await Device.findByIdAndUpdate(ids.d1, { status: 'off' });
    userSock.sock.__events.length = 0;
    roomUserSock.sock.__events.length = 0;
    recorder.clear();

    const since = Date.now();
    await recorder.publish(topic(ids.d1), JSON.stringify({ state: 'on' }));
    const userEcho = await waitForEvent(userSock.sock, 'state-updated',
      (p) => p && p.deviceId === ids.d1 && p.updatedBy === 'mqtt', 5000, since);
    const roomEcho = await waitForEvent(roomUserSock.sock, 'room-devices-updated',
      (p) => p && p.roomId === ids.room1 && p.updatedBy === 'mqtt', 5000, since);
    const mqttEsp = await recorder.waitFor(espStateTopic(ids.room1),
      (m) => m.payload && m.payload.deviceId === ids.d1 && m.payload.state === 'on', 5000, since);
    const persisted = await waitForDb(() => Device.findById(ids.d1), (d) => d && d.status === 'on');

    record('mqtt inbound device state: DB persisted', Boolean(persisted), persisted ? `status=${persisted.status}` : 'not persisted');
    record('mqtt inbound device state: /ws/user state-updated', Boolean(userEcho), userEcho ? JSON.stringify(userEcho.payload) : 'no event');
    record('mqtt inbound device state: /ws/room-user event', Boolean(roomEcho), roomEcho ? JSON.stringify(roomEcho.payload) : 'no event');
    record('mqtt inbound device state: ESP state-update published', Boolean(mqttEsp), mqttEsp ? mqttEsp.raw : 'no message');
  }

  {
    userSock.sock.__events.length = 0;
    const since = Date.now();
    await recorder.publish(statusTopic(ids.d1), JSON.stringify({ status: 'online' }), { retain: true });
    const online = await waitForEvent(userSock.sock, 'device-status',
      (p) => p && p.deviceId === ids.d1 && p.isOnline === true, 5000, since);
    const onlineDocStatus = await waitForDb(() => Device.findById(ids.d1), (d) => d && d.isOnline === true);
    record('mqtt inbound device status: online event', Boolean(online), online ? JSON.stringify(online.payload) : 'no event');
    record('mqtt inbound device status: isOnline persisted true', Boolean(onlineDocStatus),
      onlineDocStatus ? `isOnline=${onlineDocStatus.isOnline}` : 'not persisted');

    const sinceOffline = Date.now();
    await recorder.publish(statusTopic(ids.d1), JSON.stringify({ status: 'offline' }), { retain: true });
    const offline = await waitForEvent(userSock.sock, 'device-status',
      (p) => p && p.deviceId === ids.d1 && p.isOnline === false, 5000, sinceOffline);
    const offlineDocStatus = await waitForDb(() => Device.findById(ids.d1), (d) => d && d.isOnline === false);
    record('mqtt inbound device status: offline event', Boolean(offline), offline ? JSON.stringify(offline.payload) : 'no event');
    record('mqtt inbound device status: isOnline persisted false', Boolean(offlineDocStatus),
      offlineDocStatus ? `isOnline=${offlineDocStatus.isOnline}` : 'not persisted');
  }

  {
    await Device.updateMany({ _id: { $in: [ids.d1, ids.d2] } }, { status: 'off' });
    userSock.sock.__events.length = 0;
    roomUserSock.sock.__events.length = 0;
    recorder.clear();

    const since = Date.now();
    await recorder.publish(roomTopic(ids.room1), JSON.stringify({
      updates: [
        { deviceId: ids.d1, state: 'on' },
        { deviceId: ids.d2, state: 'on' },
      ],
    }));
    const persisted = await waitForDb(async () => Device.find({ _id: { $in: [ids.d1, ids.d2] } }),
      (ds) => ds.length === 2 && ds.every((d) => d.status === 'on'), 6000);
    const userEcho = await waitForEvent(userSock.sock, 'state-updated',
      (p) => p && p.deviceId === ids.d1 && p.updatedBy === 'mqtt', 5000, since);
    const roomEcho = await waitForEvent(roomUserSock.sock, 'room-devices-updated',
      (p) => p && p.roomId === ids.room1 && p.updatedBy === 'mqtt', 5000, since);
    const mqttBulk = await recorder.waitFor(espBulkTopic(ids.room1),
      (m) => m.payload && Array.isArray(m.payload.updates) && m.payload.updates.length === 2, 5000, since);

    record('mqtt inbound room state: DB persisted', Boolean(persisted), persisted ? persisted.map((d) => d.status).join(',') : 'not persisted');
    record('mqtt inbound room state: /ws/user state-updated', Boolean(userEcho), userEcho ? JSON.stringify(userEcho.payload) : 'no event');
    record('mqtt inbound room state: /ws/room-user event', Boolean(roomEcho), roomEcho ? JSON.stringify(roomEcho.payload) : 'no event');
    record('mqtt inbound room state: ESP bulk published', Boolean(mqttBulk), mqttBulk ? mqttBulk.raw : 'no message');
  }

  // ── 9. Retained state ──────────────────────────────────────────────────
  section('9. Retained state');
  {
    await recorder.publish(topic(ids.d1), JSON.stringify({ state: 'on' }), { retain: true });
    await delay(300);

    const probe = mqtt.connect(BROKER, {
      clientId: `retained-probe-${Date.now()}`,
      clean: true,
      reconnectPeriod: 0,
      connectTimeout: 8000,
    });
    const retained = await new Promise((resolve) => {
      const timer = setTimeout(() => resolve(null), 6000);
      probe.once('connect', () => {
        probe.subscribe(topic(ids.d1), { qos: 1 }, () => { /* wait for retained message */ });
      });
      probe.on('message', (t, payload, packet) => {
        if (t !== topic(ids.d1)) return;
        clearTimeout(timer);
        let parsed; try { parsed = JSON.parse(payload.toString()); } catch { parsed = null; }
        resolve({ parsed, retain: Boolean(packet && packet.retain) });
      });
      probe.once('error', () => { clearTimeout(timer); resolve(null); });
    });
    probe.end(true);

    record('retained state: new subscriber receives the last state',
      Boolean(retained && retained.parsed && retained.parsed.state === 'on' && retained.retain === true),
      retained ? `state=${retained.parsed && retained.parsed.state}, retain=${retained.retain}` : 'no retained message');
  }

  // ── 10. ESP auth / compact-state / disconnect ───────────────────────────
  section('10. MQTT ESP auth, compact-state, disconnect');
  {
    const espId = `esp-test-${Date.now()}`;
    const since = Date.now();
    await recorder.publish(espAuthTopic(espId), JSON.stringify({
      roomId: ids.room1,
      roomPassword: 'RoomPass123!',
    }));
    const auth = await recorder.waitFor(espAuthResponseTopic(espId),
      (m) => m.payload && m.payload.success === true, 5000, since);
    const roomEvent = await waitForEvent(roomUserSock.sock, 'room-esp-status-updated',
      (p) => p && p.roomId === ids.room1 && p.espConnected === true, 5000, since);
    const roomDoc = await waitForDb(() => Room.findById(ids.room1), (room) => room && room.esp_component_connected === true);

    record('mqtt esp auth: success response', Boolean(auth), auth ? JSON.stringify(auth.payload).slice(0, 180) : 'no response');
    record('mqtt esp auth: available devices listed', Boolean(auth && Array.isArray(auth.payload.availableDevices) && auth.payload.availableDevices.length === 2),
      auth && auth.payload.availableDevices ? `count=${auth.payload.availableDevices.length}` : 'none');
    record('mqtt esp auth: /ws/room-user esp status true', Boolean(roomEvent), roomEvent ? JSON.stringify(roomEvent.payload) : 'no event');
    record('mqtt esp auth: Room.esp_component_connected true', Boolean(roomDoc), roomDoc ? `esp=${roomDoc.esp_component_connected}` : 'not persisted');

    const badEspId = `esp-bad-${Date.now()}`;
    const badSince = Date.now();
    await recorder.publish(espAuthTopic(badEspId), JSON.stringify({
      roomId: ids.room1,
      roomPassword: 'wrong-password',
    }));
    const badAuth = await recorder.waitFor(espAuthResponseTopic(badEspId),
      (m) => m.payload && m.payload.success === false, 5000, badSince);
    record('mqtt esp auth: wrong password rejected', Boolean(badAuth), badAuth ? JSON.stringify(badAuth.payload) : 'no response');

    // Compact state "21" = device order 2 is on.
    await Device.findByIdAndUpdate(ids.d2, { status: 'off' });
    userSock.sock.__events.length = 0;
    roomUserSock.sock.__events.length = 0;
    const compactSince = Date.now();
    await recorder.publish(espCompactTopic(espId), '21');
    const compact = await recorder.waitFor(espCompactResponseTopic(espId),
      (m) => m.payload && m.payload.success === true, 5000, compactSince);
    const compactDb = await waitForDb(() => Device.findById(ids.d2), (d) => d && d.status === 'on');
    const compactUser = await waitForEvent(userSock.sock, 'state-updated',
      (p) => p && p.deviceId === ids.d2 && p.updatedBy === 'esp-compact', 5000, compactSince);
    const compactRoom = await waitForEvent(roomUserSock.sock, 'room-devices-updated',
      (p) => p && p.roomId === ids.room1 && p.updatedBy === 'esp-compact', 5000, compactSince);

    record('mqtt esp compact-state: success response', Boolean(compact), compact ? JSON.stringify(compact.payload) : 'no response');
    record('mqtt esp compact-state: DB persisted', Boolean(compactDb), compactDb ? `status=${compactDb.status}` : 'not persisted');
    record('mqtt esp compact-state: /ws/user state-updated', Boolean(compactUser), compactUser ? JSON.stringify(compactUser.payload) : 'no event');
    record('mqtt esp compact-state: /ws/room-user event', Boolean(compactRoom), compactRoom ? JSON.stringify(compactRoom.payload) : 'no event');

    const disconnectSince = Date.now();
    await recorder.publish(espDisconnectTopic(espId), '');
    const offlineEvent = await waitForEvent(roomUserSock.sock, 'room-esp-status-updated',
      (p) => p && p.roomId === ids.room1 && p.espConnected === false, 5000, disconnectSince);
    const offlineDoc = await waitForDb(() => Room.findById(ids.room1), (room) => room && room.esp_component_connected === false);
    const mapping = mqttBroker.getEspRoomMapping(espId);

    record('mqtt esp disconnect: /ws/room-user esp status false', Boolean(offlineEvent), offlineEvent ? JSON.stringify(offlineEvent.payload) : 'no event');
    record('mqtt esp disconnect: Room.esp_component_connected false', Boolean(offlineDoc), offlineDoc ? `esp=${offlineDoc.esp_component_connected}` : 'not persisted');
    record('mqtt esp disconnect: mapping removed', !mapping, mapping ? 'mapping still present' : 'removed');
  }

  // ── 11. Cross-room isolation ────────────────────────────────────────────
  section('11. Cross-room isolation');
  {
    await Device.findByIdAndUpdate(ids.d3, { status: 'off' });
    userSock.sock.__events.length = 0;
    roomUserSock.sock.__events.length = 0;
    recorder.clear();

    const since = Date.now();
    userSock.sock.emit('update-state', { deviceId: ids.d1, state: 'on' });
    await waitForDb(() => Device.findById(ids.d1), (d) => d && d.status === 'on', 5000);
    await delay(900);

    const d3Events = eventCount(userSock.sock, 'state-updated',
      (p) => p && p.deviceId === ids.d3, since);
    const room2Events = eventCount(roomUserSock.sock, 'room-devices-updated',
      (p) => p && p.roomId === ids.room2, since);
    const room2Mqtt = recorder.count(roomTopic(ids.room2), () => true, since);
    const d3Doc = await Device.findById(ids.d3);

    record('cross-room: no /ws/user event for the other room', d3Events === 0, `count=${d3Events}`);
    record('cross-room: no /ws/room-user event for the other room', room2Events === 0, `count=${room2Events}`);
    record('cross-room: no MQTT room-state publish for the other room', room2Mqtt === 0, `count=${room2Mqtt}`);
    record('cross-room: other device status unchanged', d3Doc && d3Doc.status === 'off', d3Doc ? `status=${d3Doc.status}` : 'missing');
  }

  // ── 12. Rapid toggles ───────────────────────────────────────────────────
  section('12. Rapid toggles');
  {
    await Device.findByIdAndUpdate(ids.d1, { status: 'off' });
    userSock.sock.__events.length = 0;
    recorder.clear();
    const since = Date.now();

    for (let i = 0; i < 6; i++) {
      userSock.sock.emit('update-state', { deviceId: ids.d1, state: i % 2 === 0 ? 'on' : 'off' });
    }

    const final = await waitForDb(() => Device.findById(ids.d1), (d) => d && d.status === 'off', 6000);
    record('rapid toggles: final DB state is correct', Boolean(final), final ? `status=${final.status}` : 'not converged');

    const infoSince = Date.now();
    userSock.sock.emit('get-device-info', { deviceId: ids.d1 });
    const info = await waitForEvent(userSock.sock, 'device-info', (p) => p && p.device && p.device.id === ids.d1, 4000, infoSince);
    record('rapid toggles: server remains responsive', Boolean(info), info ? `status=${info.payload.device.status}` : 'no response');

    await delay(1000);
    const eventTotal = eventCount(userSock.sock, 'state-updated', (p) => p && p.deviceId === ids.d1, since);
    const espTotal = recorder.count(espStateTopic(ids.room1),
      (m) => m.payload && m.payload.deviceId === ids.d1, since);
    record('rapid toggles: exactly one /ws/user state-updated per write',
      eventTotal === 6, `count=${eventTotal}`);
    record('rapid toggles: exactly one ESP state-update per write',
      espTotal === 6, `count=${espTotal}`);
  }

  // ── 13. Scheduler status_change ─────────────────────────────────────────
  section('13. Scheduler status_change');
  {
    await Device.findByIdAndUpdate(ids.d1, { status: 'off' });
    userSock.sock.__events.length = 0;
    roomUserSock.sock.__events.length = 0;
    recorder.clear();
    const since = Date.now();

    const deviceDoc = await Device.findById(ids.d1);
    await schedulerService.performDeviceAction(deviceDoc, { type: 'status_change', value: 'on' });

    const persisted = await waitForDb(() => Device.findById(ids.d1), (d) => d && d.status === 'on', 6000);
    const mqttState = await recorder.waitFor(topic(ids.d1),
      (m) => m.payload && m.payload.state === 'on' && m.payload.updatedBy === 'task', 5000, since);
    const userEcho = await waitForEvent(userSock.sock, 'state-updated',
      (p) => p && p.deviceId === ids.d1 && p.updatedBy === 'mqtt', 6000, since);
    const roomEcho = await waitForEvent(roomUserSock.sock, 'room-devices-updated',
      (p) => p && p.roomId === ids.room1 && p.updatedBy === 'mqtt', 6000, since);
    const espCmd = await recorder.waitFor(espStateTopic(ids.room1),
      (m) => m.payload && m.payload.deviceId === ids.d1 && m.payload.state === 'on', 5000, since);

    record('scheduler status_change: DB persisted', Boolean(persisted), persisted ? `status=${persisted.status}` : 'not persisted');
    record('scheduler status_change: MQTT device state published', Boolean(mqttState), mqttState ? mqttState.raw : 'no message');
    record('scheduler status_change: /ws/user state-updated', Boolean(userEcho), userEcho ? JSON.stringify(userEcho.payload) : 'no event');
    record('scheduler status_change: /ws/room-user event', Boolean(roomEcho), roomEcho ? JSON.stringify(roomEcho.payload) : 'no event');
    record('scheduler status_change: ESP state-update published', Boolean(espCmd), espCmd ? espCmd.raw : 'no message');

    await delay(900);
    const userCount = eventCount(userSock.sock, 'state-updated',
      (p) => p && p.deviceId === ids.d1, since);
    const espCount = recorder.count(espStateTopic(ids.room1),
      (m) => m.payload && m.payload.deviceId === ids.d1, since);
    record('scheduler status_change: exactly one /ws/user state-updated',
      userCount === 1, `count=${userCount}`);
    record('scheduler status_change: exactly one ESP state-update',
      espCount === 1, `count=${espCount}`);
  }

  // ── Report ──────────────────────────────────────────────────────────────
  const reportDir = path.join(__dirname, '..', 'test-reports');
  fs.mkdirSync(reportDir, { recursive: true });
  const md = [
    '# Socket.IO + MQTT Status-Switch Test Report',
    '',
    `- Date: ${new Date().toISOString()}`,
    `- Broker: ${BROKER}`,
    `- Mongo: ${MONGO}`,
    `- Total: ${passed + failed} | Passed: ${passed} | Failed: ${failed}`,
    '',
    '## Results',
    '',
    ...results.map((line) => (line ? line : '')),
    '',
  ].join('\n');
  fs.writeFileSync(path.join(reportDir, 'sockets-mqtt.md'), md);
  console.log(md);

  // Cleanup. The suite owns the local server and broker connection.
  for (const s of [userSock, otherSock, roomUserSock, deviceSock, roomEspSock]) {
    try { s.sock.close(); } catch { /* ignore */ }
  }
  try { await recorder.end(); } catch { /* ignore */ }
  try { mqttBroker.close(); } catch { /* ignore */ }
  try { await stopServer(); } catch { /* ignore */ }
  await delay(300);
  process.exit(failed === 0 ? 0 : 1);
}

main().catch(async (err) => {
  console.error('FATAL:', err && err.stack ? err.stack : err);
  try { await stopServer(); } catch { /* ignore */ }
  process.exit(2);
});
