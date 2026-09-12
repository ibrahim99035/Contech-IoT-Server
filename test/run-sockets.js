/**
 * Socket.io simulation tests — all 5 namespaces.
 *   /ws/user        (JWT)
 *   /ws/device      (componentNumber)
 *   /ws/room-esp    (componentNumber)
 *   /ws/room-user   (JWT)
 *   /ws/mqtt-bridge (roomId + deviceOrder + roomPassword)
 * Emits every inbound event and asserts the expected outbound events,
 * including negative auth cases.
 */

'use strict';

const { io: SocketClient } = require('socket.io-client');

const { startServer, stopServer } = require('./lib/bootstrap');
const { seed } = require('./lib/fixtures');

const PORT = 5091;
let passed = 0, failed = 0, results = [];

const BASE = `http://127.0.0.1:${PORT}`;

function waitEvent(sock, event, ms = 4000) {
  return new Promise((resolve) => {
    const timer = setTimeout(() => resolve({ timeout: true, event }), ms);
    sock.once(event, (data) => { clearTimeout(timer); resolve({ timeout: false, event, data }); });
  });
}

function record(name, ok, detail = '') {
  if (ok) passed++; else failed++;
  results.push(`${ok ? '✅' : '❌'} [${name}] ${detail}`);
}

function connect(nsp, opts = {}) {
  return new Promise((resolve, reject) => {
    const sock = SocketClient(`${BASE}${nsp}`, {
      transports: ['websocket'],
      // forceNew: socket.io-client multiplexes namespaces over one cached
      // engine per URL, which would keep the FIRST connection's query params
      // for later connects — breaking per-namespace handshake auth.
      forceNew: true,
      ...opts
    });
    sock.on('connect', () => resolve(sock));
    sock.on('connect_error', (e) => { try { sock.disconnect(); } catch {} reject(e); });
    sock.on('error', (e) => { try { sock.disconnect(); } catch {} reject(e); });
    setTimeout(() => reject(new Error('connect timeout')), 5000);
  });
}

// connect + record result instead of throwing (keeps the suite running)
async function tryConnect(name, nsp, opts) {
  try {
    return await connect(nsp, opts);
  } catch (e) {
    record(name, false, `connect_error: ${e.message}`);
    return null;
  }
}

async function run() {
  console.log('🚀 Socket.io namespace simulations\n');

  await startServer();
  const { S, ROOM_PASSWORD } = await seed();

  try {
    // ── /ws/user (JWT) ─────────────────────────────────────────────────
    {
      const sock = await connect('/ws/user', { auth: { token: S.tokens.customer } });

      const d1 = S.devices[1];
      sock.emit('update-state', { deviceId: d1, state: 'on' });
      const upd = await waitEvent(sock, 'state-updated');
      record('user/update-state → state-updated', !upd.timeout, `state=${upd.data?.state}`);

      sock.emit('get-device-info', { deviceId: d1 });
      const info = await waitEvent(sock, 'device-info');
      record('user/get-device-info → device-info', !info.timeout, info.timeout ? '' : `device=${info.data?.device?.name}`);

      sock.emit('get-device-esp-status', { deviceId: d1 });
      const esp = await waitEvent(sock, 'device-esp-status-response');
      record('user/get-device-esp-status → device-esp-status-response', !esp.timeout);

      sock.emit('update-state-mqtt', { deviceId: d1, state: 'off' });
      const mq = await waitEvent(sock, 'mqtt-state-update-sent');
      record('user/update-state-mqtt → mqtt-state-update-sent', !mq.timeout);

      sock.emit('update-room-devices-mqtt', {
        roomId: S.roomId,
        updates: [{ deviceId: S.devices[1], state: 'on' }, { deviceId: S.devices[2], state: 'on' }]
      });
      const mroom = await waitEvent(sock, 'mqtt-room-update-sent');
      record('user/update-room-devices-mqtt → mqtt-room-update-sent', !mroom.timeout, `count=${mroom.data?.updatesCount}`);

      sock.disconnect();
    }

    // ── /ws/device (componentNumber) ───────────────────────────────────
    {
      const sock = await tryConnect('device/connect', '/ws/device', { query: { componentNumber: S.rawComponents[1] } });
      if (sock) {
        sock.emit('report-state', { state: 'on' });
        const reported = await waitEvent(sock, 'state-reported');
        record('device/report-state → state-reported', !reported.timeout, `state=${reported.data?.state}`);
        sock.disconnect();
      }
    }

    // ── /ws/room-esp (componentNumber) ─────────────────────────────────
    {
      const sock = await tryConnect('room-esp/connect', '/ws/room-esp', { query: { componentNumber: S.rawComponents[2] } });
      if (sock) {
        sock.emit('fetch-room-devices');
        const devices = await waitEvent(sock, 'room-devices');
        record('room-esp/fetch-room-devices → room-devices', !devices.timeout, `devices=${devices.data?.devices?.length}`);

        sock.emit('update-room-devices', { updates: [{ deviceId: S.devices[1], state: 'on' }] });
        const updRes = await waitEvent(sock, 'room-update-results');
        record('room-esp/update-room-devices → room-update-results', !updRes.timeout, `success=${updRes.data?.results?.[0]?.success}`);
        sock.disconnect();
      }
    }

    // ── /ws/room-user (JWT) ────────────────────────────────────────────
    {
      const sock = await tryConnect('room-user/connect', '/ws/room-user', { auth: { token: S.tokens.customer } });
      if (sock) {
        sock.emit('fetch-user-rooms');
        const rooms = await waitEvent(sock, 'user-rooms');
        record('room-user/fetch-user-rooms → user-rooms', !rooms.timeout, `rooms=${rooms.data?.rooms?.length}`);

        sock.emit('fetch-room', { roomId: S.roomId });
        const detail = await waitEvent(sock, 'room-details');
        record('room-user/fetch-room → room-details', !detail.timeout, detail.timeout ? '' : `devices=${detail.data?.devices?.length}`);

        sock.emit('get-esp-status', { roomId: S.roomId });
        const espSt = await waitEvent(sock, 'esp-status-response');
        record('room-user/get-esp-status → esp-status-response', !espSt.timeout);

        sock.emit('update-room-devices', { roomId: S.roomId, updates: [{ deviceId: S.devices[1], state: 'off' }] });
        const ur = await waitEvent(sock, 'room-update-results');
        record('room-user/update-room-devices → room-update-results', !ur.timeout, `success=${ur.data?.results?.[0]?.success}`);
        sock.disconnect();
      }
    }

    // ── /ws/mqtt-bridge (roomId + order + password) ────────────────────
    {
      const q = { roomId: S.roomId, deviceOrder: '1', roomPassword: ROOM_PASSWORD };
      // The server emits 'mqtt-bridge-connected' inside its connection
      // handler, which can race ahead of a post-connect listener attach —
      // so subscribe BEFORE dialing.
      const sock = SocketClient(`${BASE}/ws/mqtt-bridge`, { transports: ['websocket'], forceNew: true, query: q });
      const connectedP = waitEvent(sock, 'mqtt-bridge-connected', 5000);
      const connectErrP = waitEvent(sock, 'connect_error', 5000);
      sock.on('connect', () => {});
      const connected = await Promise.race([connectedP, connectErrP.then((e) => ({ timeout: !e, event: 'connect_error', data: e }))]);
      if (connected.timeout || connected.event === 'connect_error') {
        record('mqtt-bridge connect → mqtt-bridge-connected', false, connected.data?.message || 'timeout');
      } else {
        record('mqtt-bridge connect → mqtt-bridge-connected', true, `device=${connected.data?.deviceName}`);

        sock.emit('report-state', { state: 'on' });
        const rep = await waitEvent(sock, 'state-reported');
        record('mqtt-bridge/report-state → state-reported', !rep.timeout);

        sock.emit('report-room-state', {
          roomId: S.roomId,
          updates: [{ deviceId: S.devices[1], state: 'on' }]
        });
        const rrep = await waitEvent(sock, 'room-state-reported');
        record('mqtt-bridge/report-room-state → room-state-reported', !rrep.timeout);
      }
      sock.disconnect();
    }

    // ── Negative auth cases ────────────────────────────────────────────
    {
      let deniedUser = false;
      try { await connect('/ws/user', { auth: { token: 'invalid-token' } }); } catch { deniedUser = true; }
      record('negative: /ws/user bad token rejected', deniedUser);

      let deniedDevice = false;
      try { await connect('/ws/device', { query: { componentNumber: 'does-not-exist' } }); } catch { deniedDevice = true; }
      record('negative: /ws/device unknown component rejected', deniedDevice);

      let deniedBridge = false;
      try { await connect('/ws/mqtt-bridge', { query: { roomId: S.roomId, deviceOrder: '9', roomPassword: ROOM_PASSWORD } }); } catch { deniedBridge = true; }
      record('negative: /ws/mqtt-bridge bad order rejected', deniedBridge);
    }

    return;
  } finally {
    await stopServer();
  }
}

async function main() {
  process.env.MONGODB_URI = process.env.MONGODB_URI || 'mongodb://127.0.0.1:27018/contech_sock_test';
  process.env.JWT_SECRET = process.env.JWT_SECRET || 'test_jwt_secret';
  process.env.PORT = String(PORT);
  process.env.NODE_ENV = 'test';
  process.env.MQTT_BROKER_URL = process.env.MQTT_BROKER_URL || 'mqtt://127.0.0.1:1885';

  try {
    await run();
  } finally {
    console.log('\n==================================================');
    console.log(`Socket tests: Total ${passed + failed} | Passed ${passed} | Failed ${failed}`);
    console.log('==================================================\n');
    if (results.length) console.log(results.join('\n'));
  }
  process.exit(failed === 0 ? 0 : 1);
}

process.on('unhandledRejection', (e) => { console.error('UNHANDLED:', e && e.message); });

main();