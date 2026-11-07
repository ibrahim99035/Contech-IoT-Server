/**
 * Production socket + MQTT status-switch smoke test.
 *
 * This script does NOT boot a local server. It talks to production through the
 * SSH tunnels opened for this run:
 *
 *   http://127.0.0.1:15000  -> production API 127.0.0.1:5000
 *   mqtt://127.0.0.1:11884  -> production Mosquitto 127.0.0.1:1884
 *
 * It is restricted to the existing E2E production test account/apartment/room/
 * device. Every MQTT publish is guarded so it can only target the test device,
 * test room, or the one-off test ESP id.
 *
 * Usage:
 *   node test/run-sockets-mqtt-prod.js
 */

'use strict';

const fs = require('fs');
const path = require('path');
const mqtt = require('mqtt');
const { io: ioc } = require('socket.io-client');

const API = 'http://127.0.0.1:15000';
const MQTT_URL = 'mqtt://127.0.0.1:11884';
const TOKEN = fs.readFileSync('/tmp/opencode/prod-token', 'utf8').trim();
const MQTT_USER = fs.readFileSync('/tmp/opencode/prod-mqtt-user', 'utf8').trim();
const MQTT_PASS = fs.readFileSync('/tmp/opencode/prod-mqtt-pass', 'utf8').trim();

const TEST = {
  userId: '6aef673de39d6ee8812f3036',
  apartmentId: '6aef6740e39d6ee8812f3048',
  roomId: '6aef6741e39d6ee8812f3059',
  deviceId: '6aef6741e39d6ee8812f307a',
  deviceOrder: 2,
  roomPassword: 'E2eRoom!2026#Aa9',
  serial: `prod-e2e-sock-${Date.now()}`,
  espId: `prod-esp-${Date.now()}`,
};

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

function topic() {
  return `home-automation/${TEST.deviceId}/state`;
}

function statusTopic() {
  return `home-automation/${TEST.deviceId}/status`;
}

function roomTopic() {
  return `home-automation/room/${TEST.roomId}/state`;
}

function espStateTopic() {
  return `home-automation/esp/room/${TEST.roomId}/state-update`;
}

function espBulkTopic() {
  return `home-automation/esp/room/${TEST.roomId}/bulk-update`;
}

function espAuthTopic() {
  return `home-automation/esp/${TEST.espId}/auth`;
}

function espAuthResponseTopic() {
  return `home-automation/esp/${TEST.espId}/auth/response`;
}

function espCompactTopic() {
  return `home-automation/esp/${TEST.espId}/compact-state`;
}

function espCompactResponseTopic() {
  return `home-automation/esp/${TEST.espId}/compact-state/response`;
}

function espDisconnectTopic() {
  return `home-automation/esp/${TEST.espId}/disconnect`;
}

function assertSafeTopic(topicName) {
  const allowed = [
    topic(),
    statusTopic(),
    roomTopic(),
    espAuthTopic(),
    espCompactTopic(),
    espDisconnectTopic(),
  ];
  if (!allowed.includes(topicName)) {
    throw new Error(`Refusing to publish to non-test topic: ${topicName}`);
  }
}

// ── REST ────────────────────────────────────────────────────────────────────

async function api(method, route, body) {
  const res = await fetch(`${API}${route}`, {
    method,
    headers: {
      Authorization: `Bearer ${TOKEN}`,
      'Content-Type': 'application/json',
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const text = await res.text();
  let json;
  try { json = JSON.parse(text); } catch { json = text; }
  return { status: res.status, body: json };
}

async function getDevice() {
  const r = await api('GET', `/api/device-handler/devices/room/${TEST.roomId}`);
  const devices = (r.body && r.body.data && r.body.data.devices) || (r.body && r.body.data) || [];
  return devices.find((d) => (d._id || d.id) === TEST.deviceId) || null;
}

async function getRoom() {
  const r = await api('GET', `/api/rooms-handler/rooms/apartment/${TEST.apartmentId}`);
  const rooms = (r.body && r.body.data && r.body.data.rooms) || (r.body && r.body.data) || [];
  return rooms.find((room) => (room._id || room.id) === TEST.roomId) || null;
}

async function waitForDevice(predicate, ms = 6000) {
  const deadline = Date.now() + ms;
  while (Date.now() <= deadline) {
    const d = await getDevice();
    if (predicate(d)) return d;
    await delay(100);
  }
  return null;
}

async function waitForRoom(predicate, ms = 6000) {
  const deadline = Date.now() + ms;
  while (Date.now() <= deadline) {
    const room = await getRoom();
    if (predicate(room)) return room;
    await delay(100);
  }
  return null;
}

function roomEsp(room) {
  if (!room) return null;
  if (typeof room.espConnected === 'boolean') return room.espConnected;
  if (typeof room.esp_component_connected === 'boolean') return room.esp_component_connected;
  return null;
}

function probeRetained(topicName, predicate = () => true, ms = 8000) {
  return new Promise((resolve) => {
    const probe = mqtt.connect(MQTT_URL, {
      clientId: `prod-retained-probe-${Date.now()}-${Math.random().toString(16).slice(2)}`,
      clean: true,
      reconnectPeriod: 0,
      connectTimeout: 10000,
      username: MQTT_USER,
      password: MQTT_PASS,
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

// ── Socket.IO ───────────────────────────────────────────────────────────────

function connect(ns, query = {}, auth = {}, ms = 10000) {
  return new Promise((resolve) => {
    const sock = ioc(`${API}${ns}`, {
      query,
      auth,
      transports: ['websocket'],
      reconnection: false,
      timeout: ms,
      forceNew: true,
      extraHeaders: { Origin: 'https://api-bridge.contech-iot.com' },
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

async function waitForEvent(sock, event, predicate = () => true, ms = 6000, since = Date.now()) {
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

// ── MQTT observer ───────────────────────────────────────────────────────────

class MqttRecorder {
  constructor() {
    this.client = null;
    this.messages = [];
  }

  async start() {
    this.client = mqtt.connect(MQTT_URL, {
      clientId: `prod-smoke-${Date.now()}`,
      clean: true,
      reconnectPeriod: 0,
      connectTimeout: 10000,
      username: MQTT_USER,
      password: MQTT_PASS,
    });

    await new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error('broker connect timeout')), 11000);
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

  waitFor(topicName, predicate = () => true, ms = 6000, since = Date.now()) {
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
    assertSafeTopic(topicName);
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

// ── Main ────────────────────────────────────────────────────────────────────

async function main() {
  // ── Preflight, no production writes yet ─────────────────────────────────
  section('Production preflight');
  const me = await api('GET', '/api/auth/me');
  record('prod: token identifies the E2E test user',
    me.status === 200 && me.body && me.body.data && me.body.data._id === TEST.userId,
    `status=${me.status}, id=${me.body && me.body.data && me.body.data._id}`);

  const device0 = await getDevice();
  record('prod: test device exists in the test room',
    Boolean(device0 && device0.order === TEST.deviceOrder),
    device0 ? `id=${device0._id || device0.id}, order=${device0.order}, status=${device0.status}` : 'not found');

  const room0 = await getRoom();
  record('prod: test room exists and has no ESP connected',
    Boolean(room0 && roomEsp(room0) === false),
    room0 ? `espConnected=${roomEsp(room0)}` : 'not found');

  if (!device0 || !room0) throw new Error('Production test fixtures not found');
  if (roomEsp(room0) !== false) {
    throw new Error('Refusing to run: production test room reports an ESP connected');
  }

  const originalStatus = device0.status || 'off';

  // Set known credentials on the E2E test fixtures only.
  const serialRes = await api('PUT', `/api/device-handler/devices/${TEST.deviceId}/update-component-number`, {
    componentNumber: TEST.serial,
  });
  record('prod: set known component number on test device',
    serialRes.status === 200 && serialRes.body && typeof serialRes.body.hashedComponentNumber === 'string',
    `status=${serialRes.status}`);

  const passRes = await api('PUT', `/api/rooms-handler/rooms/${TEST.roomId}/update-password`, {
    newPassword: TEST.roomPassword,
  });
  record('prod: set known room password on test room',
    passRes.status === 200 && passRes.body && passRes.body.success === true,
    `status=${passRes.status}`);

  const roomAfterConfig = await waitForRoom((r) => r && roomEsp(r) === false, 3000);
  record('prod: test room still reports no ESP after credential changes',
    Boolean(roomAfterConfig), roomAfterConfig ? `espConnected=${roomEsp(roomAfterConfig)}` : 'not readable');

  const recorder = new MqttRecorder();
  await recorder.start();
  record('prod: MQTT observer connected to the production broker through the tunnel', true, MQTT_URL);
  recorder.clear();

  // ── Valid socket connections ────────────────────────────────────────────
  section('Production namespace connections');
  const userSock = await connect('/ws/user', {}, { token: TOKEN });
  record('prod /ws/user: connects', userSock.ok, userSock.ok ? 'connected' : userSock.err);

  const roomUserSock = await connect('/ws/room-user', {}, { token: TOKEN });
  record('prod /ws/room-user: connects', roomUserSock.ok, roomUserSock.ok ? 'connected' : roomUserSock.err);

  const deviceSock = await connect('/ws/device', { componentNumber: TEST.serial });
  record('prod /ws/device: authenticates with the known serial', deviceSock.ok,
    deviceSock.ok ? 'connected' : deviceSock.err);

  const roomEspSock = await connect('/ws/room-esp', { componentNumber: TEST.serial });
  record('prod /ws/room-esp: authenticates with the known serial', roomEspSock.ok,
    roomEspSock.ok ? 'connected' : roomEspSock.err);

  await delay(700);

  const ensureDeviceOff = async () => {
    if ((await getDevice()).status === 'off') return;
    await userSock.sock.emit('update-state', { deviceId: TEST.deviceId, state: 'off' });
    await waitForDevice((d) => d && d.status === 'off', 6000);
    // Let the direct room-user broadcast settle before a test clears events.
    await delay(250);
  };

  // ── 1. /ws/user update-state ────────────────────────────────────────────
  section('1. Production /ws/user update-state');
  {
    // Start from the known original state.
    if (originalStatus !== 'off') {
      await ensureDeviceOff();
    }

    userSock.sock.__events.length = 0;
    deviceSock.sock.__events.length = 0;
    roomUserSock.sock.__events.length = 0;
    recorder.clear();

    const since = Date.now();
    userSock.sock.emit('update-state', { deviceId: TEST.deviceId, state: 'on' });

    const userEcho = await waitForEvent(userSock.sock, 'state-updated',
      (p) => p && p.deviceId === TEST.deviceId && p.updatedBy === 'user', 6000, since);
    const deviceCmd = await waitForEvent(deviceSock.sock, 'state-update',
      (p) => p && p.state === 'on', 6000, since);
    const roomEcho = await waitForEvent(roomUserSock.sock, 'room-devices-updated',
      (p) => p && p.roomId === TEST.roomId && p.updatedBy === 'user', 6000, since);
    const mqttState = await recorder.waitFor(topic(),
      (m) => m.payload && m.payload.state === 'on' && m.payload.updatedBy === 'user', 6000, since);
    const mqttEsp = await recorder.waitFor(espStateTopic(),
      (m) => m.payload && m.payload.deviceId === TEST.deviceId && m.payload.state === 'on', 6000, since);
    const persisted = await waitForDevice((d) => d && d.status === 'on', 6000);

    record('prod user update-state: REST status persisted', Boolean(persisted), persisted ? `status=${persisted.status}` : 'not persisted');
    record('prod user update-state: /ws/user echo', Boolean(userEcho), userEcho ? JSON.stringify(userEcho.payload) : 'no event');
    record('prod user update-state: /ws/device command', Boolean(deviceCmd), deviceCmd ? JSON.stringify(deviceCmd.payload) : 'no event');
    record('prod user update-state: /ws/room-user echo', Boolean(roomEcho), roomEcho ? JSON.stringify(roomEcho.payload) : 'no event');
    record('prod user update-state: MQTT device state published', Boolean(mqttState), mqttState ? mqttState.raw : 'no message');
    record('prod user update-state: MQTT ESP state-update published', Boolean(mqttEsp), mqttEsp ? mqttEsp.raw : 'no message');

    await delay(1400);
    const userCount = eventCount(userSock.sock, 'state-updated', (p) => p && p.deviceId === TEST.deviceId, since);
    const espCount = recorder.count(espStateTopic(), (m) => m.payload && m.payload.deviceId === TEST.deviceId, since);
    record('prod user update-state: exactly one /ws/user state-updated', userCount === 1, `count=${userCount}`);
    record('prod user update-state: exactly one MQTT ESP command', espCount === 1, `count=${espCount}`);
    if (userCount !== 1 || espCount !== 1) {
      note(`Production user update-state produced ${userCount} /ws/user state-updated event(s) and ${espCount} ESP command(s); the same MQTT self-echo duplicate observed locally is present in production.`);
    }
  }

  // ── 2. /ws/user update-state-mqtt ───────────────────────────────────────
  section('2. Production /ws/user update-state-mqtt');
  {
    await ensureDeviceOff();

    userSock.sock.__events.length = 0;
    recorder.clear();
    const since = Date.now();
    userSock.sock.emit('update-state-mqtt', { deviceId: TEST.deviceId, state: 'on' });

    const ack = await waitForEvent(userSock.sock, 'mqtt-state-update-sent',
      (p) => p && p.deviceId === TEST.deviceId && p.state === 'on', 5000, since);
    const mqttState = await recorder.waitFor(topic(),
      (m) => m.payload && m.payload.state === 'on' && m.payload.updatedBy === 'user', 6000, since);
    const persisted = await waitForDevice((d) => d && d.status === 'on', 7000);
    const userEcho = await waitForEvent(userSock.sock, 'state-updated',
      (p) => p && p.deviceId === TEST.deviceId && p.updatedBy === 'mqtt', 7000, since);
    const mqttEsp = await recorder.waitFor(espStateTopic(),
      (m) => m.payload && m.payload.deviceId === TEST.deviceId, 6000, since);

    record('prod update-state-mqtt: ack', Boolean(ack), ack ? JSON.stringify(ack.payload) : 'no ack');
    record('prod update-state-mqtt: MQTT published', Boolean(mqttState), mqttState ? mqttState.raw : 'no message');
    record('prod update-state-mqtt: REST status updated through self-echo', Boolean(persisted), persisted ? `status=${persisted.status}` : 'not persisted');
    record('prod update-state-mqtt: /ws/user state-updated', Boolean(userEcho), userEcho ? JSON.stringify(userEcho.payload) : 'no event');
    record('prod update-state-mqtt: ESP state-update published', Boolean(mqttEsp), mqttEsp ? mqttEsp.raw : 'no message');

    await delay(800);
    const espCount = recorder.count(espStateTopic(),
      (m) => m.payload && m.payload.deviceId === TEST.deviceId, since);
    record('prod update-state-mqtt: exactly one ESP state-update',
      espCount === 1, `count=${espCount}`);
  }

  // ── 3. /ws/user update-room-devices-mqtt ────────────────────────────────
  section('3. Production /ws/user update-room-devices-mqtt');
  {
    await ensureDeviceOff();

    userSock.sock.__events.length = 0;
    roomUserSock.sock.__events.length = 0;
    recorder.clear();
    const since = Date.now();
    userSock.sock.emit('update-room-devices-mqtt', {
      roomId: TEST.roomId,
      updates: [{ deviceId: TEST.deviceId, state: 'on' }],
    });

    const ack = await waitForEvent(userSock.sock, 'mqtt-room-update-sent',
      (p) => p && p.roomId === TEST.roomId && p.updatesCount === 1, 5000, since);
    const mqttRoom = await recorder.waitFor(roomTopic(),
      (m) => m.payload && Array.isArray(m.payload.updates) && m.payload.updates.length === 1, 6000, since);
    const persisted = await waitForDevice((d) => d && d.status === 'on', 7000);
    const roomEcho = await waitForEvent(roomUserSock.sock, 'room-devices-updated',
      (p) => p && p.roomId === TEST.roomId && p.updatedBy === 'mqtt', 7000, since);
    const mqttBulk = await recorder.waitFor(espBulkTopic(),
      (m) => m.payload && Array.isArray(m.payload.updates) && m.payload.updates.length === 1, 6000, since);

    record('prod update-room-devices-mqtt: ack', Boolean(ack), ack ? JSON.stringify(ack.payload) : 'no ack');
    record('prod update-room-devices-mqtt: MQTT room state published', Boolean(mqttRoom), mqttRoom ? mqttRoom.raw : 'no message');
    record('prod update-room-devices-mqtt: REST status updated through self-echo', Boolean(persisted), persisted ? `status=${persisted.status}` : 'not persisted');
    record('prod update-room-devices-mqtt: /ws/room-user echo', Boolean(roomEcho), roomEcho ? JSON.stringify(roomEcho.payload) : 'no event');
    record('prod update-room-devices-mqtt: ESP bulk published', Boolean(mqttBulk), mqttBulk ? mqttBulk.raw : 'no message');

    await delay(800);
    const bulkCount = recorder.count(espBulkTopic(),
      (m) => m.payload && Array.isArray(m.payload.updates) && m.payload.updates.length === 1, since);
    record('prod update-room-devices-mqtt: exactly one ESP bulk',
      bulkCount === 1, `count=${bulkCount}`);
  }

  // ── 4. /ws/room-user update-room-devices ────────────────────────────────
  section('4. Production /ws/room-user update-room-devices');
  {
    await ensureDeviceOff();

    userSock.sock.__events.length = 0;
    roomUserSock.sock.__events.length = 0;
    deviceSock.sock.__events.length = 0;
    roomEspSock.sock.__events.length = 0;
    recorder.clear();
    const since = Date.now();
    roomUserSock.sock.emit('update-room-devices', {
      roomId: TEST.roomId,
      updates: [{ deviceId: TEST.deviceId, state: 'on' }],
    });

    const ack = await waitForEvent(roomUserSock.sock, 'room-update-results',
      (p) => p && Array.isArray(p.results) && p.results.length === 1 && p.results[0].success, 6000, since);
    const userEcho = await waitForEvent(userSock.sock, 'state-updated',
      (p) => p && p.deviceId === TEST.deviceId && p.updatedBy === 'user', 6000, since);
    const deviceCmd = await waitForEvent(deviceSock.sock, 'state-update',
      (p) => p && p.state === 'on' && p.updatedBy === 'user', 6000, since);
    const roomEspCmd = await waitForEvent(roomEspSock.sock, 'room-state-changed',
      (p) => p && p.roomId === TEST.roomId, 6000, since);
    const mqttRoom = await recorder.waitFor(roomTopic(),
      (m) => m.payload && Array.isArray(m.payload.updates) && m.payload.updates.length === 1, 6000, since);
    const persisted = await waitForDevice((d) => d && d.status === 'on', 7000);

    record('prod room-user update: results ack', Boolean(ack), ack ? JSON.stringify(ack.payload) : 'no ack');
    record('prod room-user update: /ws/user echo', Boolean(userEcho), userEcho ? JSON.stringify(userEcho.payload) : 'no event');
    record('prod room-user update: /ws/device command', Boolean(deviceCmd), deviceCmd ? JSON.stringify(deviceCmd.payload) : 'no event');
    record('prod room-user update: /ws/room-esp command', Boolean(roomEspCmd), roomEspCmd ? JSON.stringify(roomEspCmd.payload) : 'no event');
    record('prod room-user update: MQTT room state published', Boolean(mqttRoom), mqttRoom ? mqttRoom.raw : 'no message');
    record('prod room-user update: REST status persisted', Boolean(persisted), persisted ? `status=${persisted.status}` : 'not persisted');

    await delay(1200);
    const roomEventCount = eventCount(roomUserSock.sock, 'room-devices-updated', (p) => p && p.roomId === TEST.roomId, since);
    record('prod room-user update: exactly one room-devices-updated', roomEventCount === 1, `count=${roomEventCount}`);
    if (roomEventCount !== 1) {
      note(`Production room-user update produced ${roomEventCount} room-devices-updated event(s); the MQTT self-echo duplicate is present.`);
    }
  }

  // ── 5. /ws/device report-state ──────────────────────────────────────────
  section('5. Production /ws/device report-state');
  {
    await ensureDeviceOff();

    userSock.sock.__events.length = 0;
    roomUserSock.sock.__events.length = 0;
    deviceSock.sock.__events.length = 0;
    roomEspSock.sock.__events.length = 0;
    recorder.clear();
    const since = Date.now();
    deviceSock.sock.emit('report-state', { state: 'on' });

    const ack = await waitForEvent(deviceSock.sock, 'state-reported', (p) => p && p.state === 'on', 5000, since);
    const userEcho = await waitForEvent(userSock.sock, 'state-update',
      (p) => p && p.deviceId === TEST.deviceId && p.updatedBy === 'device', 6000, since);
    const roomEcho = await waitForEvent(roomUserSock.sock, 'room-devices-updated',
      (p) => p && p.roomId === TEST.roomId && p.updatedBy === 'device', 6000, since);
    const roomEspEcho = await waitForEvent(roomEspSock.sock, 'room-state-changed',
      (p) => p && p.roomId === TEST.roomId, 6000, since);
    const mqttState = await recorder.waitFor(topic(),
      (m) => m.payload && m.payload.state === 'on' && m.payload.updatedBy === 'device', 6000, since);
    const mqttEsp = await recorder.waitFor(espStateTopic(),
      (m) => m.payload && m.payload.deviceId === TEST.deviceId && m.payload.state === 'on', 6000, since);
    const persisted = await waitForDevice((d) => d && d.status === 'on', 6000);

    record('prod device report-state: ack', Boolean(ack), ack ? JSON.stringify(ack.payload) : 'no ack');
    record('prod device report-state: /ws/user state-update', Boolean(userEcho), userEcho ? JSON.stringify(userEcho.payload) : 'no event');
    record('prod device report-state: /ws/room-user event', Boolean(roomEcho), roomEcho ? JSON.stringify(roomEcho.payload) : 'no event');
    record('prod device report-state: /ws/room-esp event', Boolean(roomEspEcho), roomEspEcho ? JSON.stringify(roomEspEcho.payload) : 'no event');
    record('prod device report-state: MQTT device state published', Boolean(mqttState), mqttState ? mqttState.raw : 'no message');
    record('prod device report-state: MQTT ESP state-update published', Boolean(mqttEsp), mqttEsp ? mqttEsp.raw : 'no message');
    record('prod device report-state: REST status persisted', Boolean(persisted), persisted ? `status=${persisted.status}` : 'not persisted');

    await delay(1000);
    const userCount = eventCount(userSock.sock, 'state-update',
      (p) => p && p.deviceId === TEST.deviceId, since);
    const mqttCount = recorder.count(topic(),
      (m) => m.payload && m.payload.state === 'on', since);
    const espCount = recorder.count(espStateTopic(),
      (m) => m.payload && m.payload.deviceId === TEST.deviceId, since);
    record('prod device report-state: exactly one /ws/user event',
      userCount === 1, `count=${userCount}`);
    record('prod device report-state: exactly one MQTT device state',
      mqttCount === 1, `count=${mqttCount}`);
    record('prod device report-state: exactly one MQTT ESP state-update',
      espCount === 1, `count=${espCount}`);
  }

  // ── 6. /ws/room-esp update-room-devices ─────────────────────────────────
  section('6. Production /ws/room-esp update-room-devices');
  {
    await ensureDeviceOff();

    userSock.sock.__events.length = 0;
    roomUserSock.sock.__events.length = 0;
    deviceSock.sock.__events.length = 0;
    recorder.clear();
    const since = Date.now();
    roomEspSock.sock.emit('update-room-devices', {
      updates: [{ deviceId: TEST.deviceId, state: 'on' }],
    });

    const ack = await waitForEvent(roomEspSock.sock, 'room-update-results',
      (p) => p && Array.isArray(p.results) && p.results.length === 1 && p.results[0].success, 6000, since);
    const userEcho = await waitForEvent(userSock.sock, 'state-updated',
      (p) => p && p.deviceId === TEST.deviceId && p.updatedBy === 'esp', 6000, since);
    const deviceCmd = await waitForEvent(deviceSock.sock, 'state-update',
      (p) => p && p.state === 'on' && p.updatedBy === 'esp', 6000, since);
    const roomEcho = await waitForEvent(roomUserSock.sock, 'room-devices-updated',
      (p) => p && p.roomId === TEST.roomId && p.updatedBy === 'esp', 6000, since);
    const mqttRoom = await recorder.waitFor(roomTopic(),
      (m) => m.payload && Array.isArray(m.payload.updates) && m.payload.updates.length === 1, 6000, since);
    const mqttBulk = await recorder.waitFor(espBulkTopic(),
      (m) => m.payload && Array.isArray(m.payload.updates) && m.payload.updates.length === 1, 6000, since);
    const persisted = await waitForDevice((d) => d && d.status === 'on', 7000);

    record('prod room-esp update: results ack', Boolean(ack), ack ? JSON.stringify(ack.payload) : 'no ack');
    record('prod room-esp update: /ws/user state-updated', Boolean(userEcho), userEcho ? JSON.stringify(userEcho.payload) : 'no event');
    record('prod room-esp update: /ws/device command', Boolean(deviceCmd), deviceCmd ? JSON.stringify(deviceCmd.payload) : 'no event');
    record('prod room-esp update: /ws/room-user event', Boolean(roomEcho), roomEcho ? JSON.stringify(roomEcho.payload) : 'no event');
    record('prod room-esp update: MQTT room state published', Boolean(mqttRoom), mqttRoom ? mqttRoom.raw : 'no message');
    record('prod room-esp update: MQTT ESP bulk published', Boolean(mqttBulk), mqttBulk ? mqttBulk.raw : 'no message');
    record('prod room-esp update: REST status persisted', Boolean(persisted), persisted ? `status=${persisted.status}` : 'not persisted');

    await delay(1000);
    const roomEventCount = eventCount(roomUserSock.sock, 'room-devices-updated',
      (p) => p && p.roomId === TEST.roomId, since);
    const mqttCount = recorder.count(roomTopic(),
      (m) => m.payload && Array.isArray(m.payload.updates) && m.payload.updates.length === 1, since);
    const espCount = recorder.count(espBulkTopic(),
      (m) => m.payload && Array.isArray(m.payload.updates) && m.payload.updates.length === 1, since);
    record('prod room-esp update: exactly one /ws/room-user event',
      roomEventCount === 1, `count=${roomEventCount}`);
    record('prod room-esp update: exactly one MQTT room state',
      mqttCount === 1, `count=${mqttCount}`);
    record('prod room-esp update: exactly one MQTT ESP bulk',
      espCount === 1, `count=${espCount}`);
  }

  // ── 7. /ws/mqtt-bridge ──────────────────────────────────────────────────
  section('7. Production /ws/mqtt-bridge');
  {
    await ensureDeviceOff();

    userSock.sock.__events.length = 0;
    roomUserSock.sock.__events.length = 0;
    recorder.clear();
    const since = Date.now();
    const bridge = await connect('/ws/mqtt-bridge', {
      roomId: TEST.roomId,
      deviceOrder: String(TEST.deviceOrder),
      roomPassword: TEST.roomPassword,
    });
    record('prod mqtt-bridge: valid credentials connect', bridge.ok, bridge.ok ? 'connected' : bridge.err);

    const greet = await waitForEvent(bridge.sock, 'mqtt-bridge-connected',
      (p) => p && p.deviceId === TEST.deviceId, 6000, since);
    const roomEvent = await waitForEvent(roomUserSock.sock, 'room-esp-status-updated',
      (p) => p && p.roomId === TEST.roomId && p.espConnected === true, 6000, since);
    const mqttOnline = await recorder.waitFor(statusTopic(),
      (m) => m.payload && m.payload.status === 'online', 6000, since);
    const roomDoc = await waitForRoom((r) => r && roomEsp(r) === true, 6000);
    const onlineDevice = await waitForDevice((d) => d && d.isOnline === true, 6000);

    record('prod mqtt-bridge: greeting', Boolean(greet), greet ? JSON.stringify(greet.payload) : 'no greeting');
    record('prod mqtt-bridge: /ws/room-user esp true', Boolean(roomEvent), roomEvent ? JSON.stringify(roomEvent.payload) : 'no event');
    record('prod mqtt-bridge: MQTT status online', Boolean(mqttOnline), mqttOnline ? mqttOnline.raw : 'no message');
    record('prod mqtt-bridge: REST room espConnected true', Boolean(roomDoc), roomDoc ? `esp=${roomEsp(roomDoc)}` : 'not persisted');
    record('prod mqtt-bridge: REST device isOnline true', Boolean(onlineDevice), onlineDevice ? `isOnline=${onlineDevice.isOnline}` : 'not persisted');

    userSock.sock.__events.length = 0;
    recorder.clear();
    const reportSince = Date.now();
    bridge.sock.emit('report-state', { state: 'on' });
    const reportAck = await waitForEvent(bridge.sock, 'state-reported', (p) => p && p.success === true, 5000, reportSince);
    const reportMqtt = await recorder.waitFor(topic(),
      (m) => m.payload && m.payload.state === 'on' && m.payload.updatedBy === 'device', 6000, reportSince);
    const reportDb = await waitForDevice((d) => d && d.status === 'on', 7000);
    const reportUser = await waitForEvent(userSock.sock, 'state-updated',
      (p) => p && p.deviceId === TEST.deviceId && p.updatedBy === 'mqtt', 7000, reportSince);
    const reportEsp = await recorder.waitFor(espStateTopic(),
      (m) => m.payload && m.payload.deviceId === TEST.deviceId && m.payload.state === 'on', 6000, reportSince);

    record('prod mqtt-bridge report-state: ack', Boolean(reportAck), reportAck ? JSON.stringify(reportAck.payload) : 'no ack');
    record('prod mqtt-bridge report-state: MQTT published', Boolean(reportMqtt), reportMqtt ? reportMqtt.raw : 'no message');
    record('prod mqtt-bridge report-state: REST status updated', Boolean(reportDb), reportDb ? `status=${reportDb.status}` : 'not persisted');
    record('prod mqtt-bridge report-state: /ws/user state-updated', Boolean(reportUser), reportUser ? JSON.stringify(reportUser.payload) : 'no event');
    record('prod mqtt-bridge report-state: ESP state-update published', Boolean(reportEsp), reportEsp ? reportEsp.raw : 'no message');

    await delay(800);
    const reportEspCount = recorder.count(espStateTopic(),
      (m) => m.payload && m.payload.deviceId === TEST.deviceId, reportSince);
    record('prod mqtt-bridge report-state: exactly one ESP state-update',
      reportEspCount === 1, `count=${reportEspCount}`);

    roomUserSock.sock.__events.length = 0;
    recorder.clear();
    const roomSince = Date.now();
    bridge.sock.emit('report-room-state', {
      roomId: TEST.roomId,
      updates: [{ deviceId: TEST.deviceId, state: 'off' }],
    });
    const roomAck = await waitForEvent(bridge.sock, 'room-state-reported', (p) => p && p.success === true, 5000, roomSince);
    const roomMqtt = await recorder.waitFor(roomTopic(),
      (m) => m.payload && Array.isArray(m.payload.updates) && m.payload.updates.length === 1, 6000, roomSince);
    const roomDb = await waitForDevice((d) => d && d.status === 'off', 7000);
    const roomBulk = await recorder.waitFor(espBulkTopic(),
      (m) => m.payload && Array.isArray(m.payload.updates) && m.payload.updates.length === 1, 6000, roomSince);

    record('prod mqtt-bridge report-room-state: ack', Boolean(roomAck), roomAck ? JSON.stringify(roomAck.payload) : 'no ack');
    record('prod mqtt-bridge report-room-state: MQTT published', Boolean(roomMqtt), roomMqtt ? roomMqtt.raw : 'no message');
    record('prod mqtt-bridge report-room-state: REST status updated', Boolean(roomDb), roomDb ? `status=${roomDb.status}` : 'not persisted');
    record('prod mqtt-bridge report-room-state: ESP bulk published', Boolean(roomBulk), roomBulk ? roomBulk.raw : 'no message');

    await delay(800);
    const roomBulkCount = recorder.count(espBulkTopic(),
      (m) => m.payload && Array.isArray(m.payload.updates) && m.payload.updates.length === 1, roomSince);
    record('prod mqtt-bridge report-room-state: exactly one ESP bulk',
      roomBulkCount === 1, `count=${roomBulkCount}`);

    roomUserSock.sock.__events.length = 0;
    const disconnectSince = Date.now();
    bridge.sock.close();
    const offlineEvent = await waitForEvent(roomUserSock.sock, 'room-esp-status-updated',
      (p) => p && p.roomId === TEST.roomId && p.espConnected === false, 6000, disconnectSince);
    const offlineDoc = await waitForRoom((r) => r && roomEsp(r) === false, 6000);
    const offlineStatus = await recorder.waitFor(statusTopic(),
      (m) => m.payload && m.payload.status === 'offline', 6000, disconnectSince);
    const offlineDevice = await waitForDevice((d) => d && d.isOnline === false, 6000);
    const retainedOffline = await probeRetained(statusTopic(), (p) => p && p.status === 'offline');

    record('prod mqtt-bridge disconnect: /ws/room-user esp false', Boolean(offlineEvent), offlineEvent ? JSON.stringify(offlineEvent.payload) : 'no event');
    record('prod mqtt-bridge disconnect: REST room espConnected false', Boolean(offlineDoc), offlineDoc ? `esp=${roomEsp(offlineDoc)}` : 'not persisted');
    record('prod mqtt-bridge disconnect: MQTT status offline published', Boolean(offlineStatus), offlineStatus ? offlineStatus.raw : 'no message');
    record('prod mqtt-bridge disconnect: REST device isOnline false', Boolean(offlineDevice), offlineDevice ? `isOnline=${offlineDevice.isOnline}` : 'not persisted');
    record('prod mqtt-bridge disconnect: retained status offline', Boolean(retainedOffline && retainedOffline.retain),
      retainedOffline ? `retain=${retainedOffline.retain}, raw=${retainedOffline.raw}` : 'no retained message');
  }

  // ── 8. Inbound MQTT state / status / room ───────────────────────────────
  section('8. Production inbound MQTT state, status, and room state');
  {
    await ensureDeviceOff();

    userSock.sock.__events.length = 0;
    roomUserSock.sock.__events.length = 0;
    recorder.clear();
    const since = Date.now();
    await recorder.publish(topic(), JSON.stringify({ state: 'on' }));

    const userEcho = await waitForEvent(userSock.sock, 'state-updated',
      (p) => p && p.deviceId === TEST.deviceId && p.updatedBy === 'mqtt', 6000, since);
    const roomEcho = await waitForEvent(roomUserSock.sock, 'room-devices-updated',
      (p) => p && p.roomId === TEST.roomId && p.updatedBy === 'mqtt', 6000, since);
    const mqttEsp = await recorder.waitFor(espStateTopic(),
      (m) => m.payload && m.payload.deviceId === TEST.deviceId && m.payload.state === 'on', 6000, since);
    const persisted = await waitForDevice((d) => d && d.status === 'on', 6000);

    record('prod MQTT inbound state: REST status persisted', Boolean(persisted), persisted ? `status=${persisted.status}` : 'not persisted');
    record('prod MQTT inbound state: /ws/user state-updated', Boolean(userEcho), userEcho ? JSON.stringify(userEcho.payload) : 'no event');
    record('prod MQTT inbound state: /ws/room-user event', Boolean(roomEcho), roomEcho ? JSON.stringify(roomEcho.payload) : 'no event');
    record('prod MQTT inbound state: MQTT ESP state-update published', Boolean(mqttEsp), mqttEsp ? mqttEsp.raw : 'no message');
  }

  {
    userSock.sock.__events.length = 0;
    const since = Date.now();
    await recorder.publish(statusTopic(), JSON.stringify({ status: 'online' }), { retain: true });
    const online = await waitForEvent(userSock.sock, 'device-status',
      (p) => p && p.deviceId === TEST.deviceId && p.isOnline === true, 6000, since);
    const onlineDocStatus = await waitForDevice((d) => d && d.isOnline === true, 6000);
    record('prod MQTT inbound status: online event', Boolean(online), online ? JSON.stringify(online.payload) : 'no event');
    record('prod MQTT inbound status: isOnline persisted true', Boolean(onlineDocStatus),
      onlineDocStatus ? `isOnline=${onlineDocStatus.isOnline}` : 'not persisted');

    const sinceOffline = Date.now();
    await recorder.publish(statusTopic(), JSON.stringify({ status: 'offline' }), { retain: true });
    const offline = await waitForEvent(userSock.sock, 'device-status',
      (p) => p && p.deviceId === TEST.deviceId && p.isOnline === false, 6000, sinceOffline);
    const offlineDocStatus = await waitForDevice((d) => d && d.isOnline === false, 6000);
    record('prod MQTT inbound status: offline event', Boolean(offline), offline ? JSON.stringify(offline.payload) : 'no event');
    record('prod MQTT inbound status: isOnline persisted false', Boolean(offlineDocStatus),
      offlineDocStatus ? `isOnline=${offlineDocStatus.isOnline}` : 'not persisted');
  }

  {
    await ensureDeviceOff();

    userSock.sock.__events.length = 0;
    roomUserSock.sock.__events.length = 0;
    recorder.clear();
    const since = Date.now();
    await recorder.publish(roomTopic(), JSON.stringify({
      updates: [{ deviceId: TEST.deviceId, state: 'on' }],
    }));

    const userEcho = await waitForEvent(userSock.sock, 'state-updated',
      (p) => p && p.deviceId === TEST.deviceId && p.updatedBy === 'mqtt', 6000, since);
    const roomEcho = await waitForEvent(roomUserSock.sock, 'room-devices-updated',
      (p) => p && p.roomId === TEST.roomId && p.updatedBy === 'mqtt', 6000, since);
    const mqttBulk = await recorder.waitFor(espBulkTopic(),
      (m) => m.payload && Array.isArray(m.payload.updates) && m.payload.updates.length === 1, 6000, since);
    const persisted = await waitForDevice((d) => d && d.status === 'on', 6000);

    record('prod MQTT inbound room state: REST status persisted', Boolean(persisted), persisted ? `status=${persisted.status}` : 'not persisted');
    record('prod MQTT inbound room state: /ws/user state-updated', Boolean(userEcho), userEcho ? JSON.stringify(userEcho.payload) : 'no event');
    record('prod MQTT inbound room state: /ws/room-user event', Boolean(roomEcho), roomEcho ? JSON.stringify(roomEcho.payload) : 'no event');
    record('prod MQTT inbound room state: MQTT ESP bulk published', Boolean(mqttBulk), mqttBulk ? mqttBulk.raw : 'no message');
  }

  // ── 9. Retained state ───────────────────────────────────────────────────
  section('9. Production retained state');
  {
    await recorder.publish(topic(), JSON.stringify({ state: 'on' }), { retain: true });
    await delay(400);

    const probe = mqtt.connect(MQTT_URL, {
      clientId: `prod-retained-${Date.now()}`,
      clean: true,
      reconnectPeriod: 0,
      connectTimeout: 10000,
      username: MQTT_USER,
      password: MQTT_PASS,
    });
    const retained = await new Promise((resolve) => {
      const timer = setTimeout(() => resolve(null), 8000);
      probe.once('connect', () => {
        probe.subscribe(topic(), { qos: 1 }, () => { /* wait for retained message */ });
      });
      probe.on('message', (t, payload, packet) => {
        if (t !== topic()) return;
        clearTimeout(timer);
        let parsed; try { parsed = JSON.parse(payload.toString()); } catch { parsed = null; }
        resolve({ parsed, retain: Boolean(packet && packet.retain) });
      });
      probe.once('error', () => { clearTimeout(timer); resolve(null); });
    });
    probe.end(true);

    record('prod retained state: new subscriber receives the last state',
      Boolean(retained && retained.parsed && retained.parsed.state === 'on' && retained.retain === true),
      retained ? `state=${retained.parsed && retained.parsed.state}, retain=${retained.retain}` : 'no retained message');
  }

  // ── 10. MQTT ESP auth / compact-state / disconnect ──────────────────────
  section('10. Production MQTT ESP auth, compact-state, disconnect');
  {
    const since = Date.now();
    await recorder.publish(espAuthTopic(), JSON.stringify({
      roomId: TEST.roomId,
      roomPassword: TEST.roomPassword,
    }));
    const auth = await recorder.waitFor(espAuthResponseTopic(),
      (m) => m.payload && m.payload.success === true, 6000, since);
    const roomEvent = await waitForEvent(roomUserSock.sock, 'room-esp-status-updated',
      (p) => p && p.roomId === TEST.roomId && p.espConnected === true, 6000, since);
    const roomDoc = await waitForRoom((r) => r && roomEsp(r) === true, 6000);

    record('prod MQTT ESP auth: success response', Boolean(auth), auth ? JSON.stringify(auth.payload).slice(0, 180) : 'no response');
    record('prod MQTT ESP auth: available devices listed', Boolean(auth && Array.isArray(auth.payload.availableDevices) && auth.payload.availableDevices.length >= 1),
      auth && auth.payload.availableDevices ? `count=${auth.payload.availableDevices.length}` : 'none');
    record('prod MQTT ESP auth: /ws/room-user esp true', Boolean(roomEvent), roomEvent ? JSON.stringify(roomEvent.payload) : 'no event');
    record('prod MQTT ESP auth: REST room espConnected true', Boolean(roomDoc), roomDoc ? `esp=${roomEsp(roomDoc)}` : 'not persisted');

    // Compact state "21" = device order 2 is on.
    await ensureDeviceOff();
    userSock.sock.__events.length = 0;
    roomUserSock.sock.__events.length = 0;
    const compactSince = Date.now();
    await recorder.publish(espCompactTopic(), '21');
    const compact = await recorder.waitFor(espCompactResponseTopic(),
      (m) => m.payload && m.payload.success === true, 6000, compactSince);
    const compactDb = await waitForDevice((d) => d && d.status === 'on', 6000);
    const compactUser = await waitForEvent(userSock.sock, 'state-updated',
      (p) => p && p.deviceId === TEST.deviceId && p.updatedBy === 'esp-compact', 6000, compactSince);
    const compactRoom = await waitForEvent(roomUserSock.sock, 'room-devices-updated',
      (p) => p && p.roomId === TEST.roomId && p.updatedBy === 'esp-compact', 6000, compactSince);

    record('prod MQTT ESP compact-state: success response', Boolean(compact), compact ? JSON.stringify(compact.payload) : 'no response');
    record('prod MQTT ESP compact-state: REST status persisted', Boolean(compactDb), compactDb ? `status=${compactDb.status}` : 'not persisted');
    record('prod MQTT ESP compact-state: /ws/user state-updated', Boolean(compactUser), compactUser ? JSON.stringify(compactUser.payload) : 'no event');
    record('prod MQTT ESP compact-state: /ws/room-user event', Boolean(compactRoom), compactRoom ? JSON.stringify(compactRoom.payload) : 'no event');

    const disconnectSince = Date.now();
    await recorder.publish(espDisconnectTopic(), '');
    const offlineEvent = await waitForEvent(roomUserSock.sock, 'room-esp-status-updated',
      (p) => p && p.roomId === TEST.roomId && p.espConnected === false, 6000, disconnectSince);
    const offlineDoc = await waitForRoom((r) => r && roomEsp(r) === false, 6000);

    record('prod MQTT ESP disconnect: /ws/room-user esp false', Boolean(offlineEvent), offlineEvent ? JSON.stringify(offlineEvent.payload) : 'no event');
    record('prod MQTT ESP disconnect: REST room espConnected false', Boolean(offlineDoc), offlineDoc ? `esp=${roomEsp(offlineDoc)}` : 'not persisted');
  }

  // ── 11. Rapid toggles and restore ───────────────────────────────────────
  section('11. Production rapid toggles and restore');
  {
    await ensureDeviceOff();

    userSock.sock.__events.length = 0;
    recorder.clear();
    const since = Date.now();
    for (let i = 0; i < 4; i++) {
      userSock.sock.emit('update-state', { deviceId: TEST.deviceId, state: i % 2 === 0 ? 'on' : 'off' });
    }

    const final = await waitForDevice((d) => d && d.status === 'off', 7000);
    record('prod rapid toggles: final status off', Boolean(final), final ? `status=${final.status}` : 'not converged');

    const infoSince = Date.now();
    userSock.sock.emit('get-device-info', { deviceId: TEST.deviceId });
    const info = await waitForEvent(userSock.sock, 'device-info',
      (p) => p && p.device && p.device.id === TEST.deviceId, 6000, infoSince);
    record('prod rapid toggles: server remains responsive', Boolean(info), info ? `status=${info.payload.device.status}` : 'no response');

    await delay(1000);
    const eventTotal = eventCount(userSock.sock, 'state-updated', (p) => p && p.deviceId === TEST.deviceId, since);
    const espTotal = recorder.count(espStateTopic(),
      (m) => m.payload && m.payload.deviceId === TEST.deviceId, since);
    record('prod rapid toggles: exactly one /ws/user state-updated per write',
      eventTotal === 4, `count=${eventTotal}`);
    record('prod rapid toggles: exactly one ESP state-update per write',
      espTotal === 4, `count=${espTotal}`);

    // Restore the original state through the real switch path.
    if ((await getDevice()).status !== originalStatus) {
      await userSock.sock.emit('update-state', { deviceId: TEST.deviceId, state: originalStatus });
    }
    const restored = await waitForDevice((d) => d && d.status === originalStatus, 7000);
    record('prod restore: original device status restored', Boolean(restored),
      restored ? `status=${restored.status}` : `wanted ${originalStatus}`);

    // Clear the retained online status left by the mqtt-bridge test.
    await recorder.publish(statusTopic(), JSON.stringify({ status: 'offline', timestamp: new Date().toISOString() }), { retain: true });
    await delay(300);
    note(`Production test device ${TEST.deviceId} now has retained status:offline and state:${originalStatus}. The component number and room password were changed for testing and left in place for inspection.`);
  }

  // ── Report ──────────────────────────────────────────────────────────────
  const reportDir = path.join(__dirname, '..', 'test-reports');
  fs.mkdirSync(reportDir, { recursive: true });
  const md = [
    '# Production Socket.IO + MQTT Status-Switch Test Report',
    '',
    `- Date: ${new Date().toISOString()}`,
    `- API: ${API} (SSH tunnel to production 127.0.0.1:5000)`,
    `- Broker: ${MQTT_URL} (SSH tunnel to production 127.0.0.1:1884)`,
    `- Test user: ${TEST.userId}`,
    `- Test apartment: ${TEST.apartmentId}`,
    `- Test room: ${TEST.roomId}`,
    `- Test device: ${TEST.deviceId} (order ${TEST.deviceOrder})`,
    `- Total: ${passed + failed} | Passed: ${passed} | Failed: ${failed}`,
    '',
    '## Results',
    '',
    ...results,
    '',
  ].join('\n');
  fs.writeFileSync(path.join(reportDir, 'sockets-mqtt-production.md'), md);
  console.log(md);

  for (const s of [userSock, roomUserSock, deviceSock, roomEspSock]) {
    try { s.sock.close(); } catch { /* ignore */ }
  }
  try { await recorder.end(); } catch { /* ignore */ }
  await delay(300);
  process.exit(failed === 0 ? 0 : 1);
}

main().catch((err) => {
  console.error('FATAL:', err && err.stack ? err.stack : err);
  process.exit(2);
});
