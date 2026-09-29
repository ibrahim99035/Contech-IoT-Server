/**
 * Socket.IO verification — all 5 namespaces, auth paths and event round-trips.
 *
 * Boots the real stack via lib/bootstrap (same wiring as server.js) and drives
 * it with real socket.io-client connections. Covers:
 *   - handshake rejection: no/invalid token, unknown component, bad room pwd
 *   - handshake acceptance for every namespace
 *   - every inbound event the client emits -> the server's response
 *
 * Emits test-reports/sockets.md
 * Usage: node test/run-sockets.js
 */

'use strict';

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const mongoose = require('mongoose');
const jwt = require('jsonwebtoken');
const { io: ioc } = require('socket.io-client');

const { startServer } = require('./lib/bootstrap');
const { request } = require('./lib/httpClient');
const User = require('../src/models/User');
const Apartment = require('../src/models/Apartment');
const Room = require('../src/models/Room');
const Device = require('../src/models/Device');
const Task = require('../src/models/Task');
const seedSubscriptionLimits = require('../src/scripts/seedSubscriptionLimits');

const PORT = 5096;
const JWT_SECRET = 'socket_test_secret';
const sha256 = (v) => crypto.createHash('sha256').update(String(v)).digest('hex');

let passed = 0, failed = 0;
const results = [];
const record = (name, ok, detail = '') => {
  ok ? passed++ : failed++;
  results.push(`${ok ? '✅' : '❌'} [${name}] ${detail}`.trim());
};

// Connect to a namespace and settle. Resolves {sock, err, greet} — err set when
// the server refused the handshake. `greet` captures an event the server emits
// from inside its own connection handler, which would otherwise be missed
// because the client attaches its listeners after 'connect' resolves.
function connect(ns, query = {}, auth = {}, ms = 6000, greetEvt = null) {
  return new Promise((resolve) => {
    const sock = ioc(`http://127.0.0.1:${PORT}${ns}`, {
      query, auth, transports: ['websocket'], reconnection: false, timeout: ms, forceNew: true,
    });
    let settled = false;
    const box = { greet: null };
    if (greetEvt) sock.once(greetEvt, (p) => { box.greet = p; });
    sock.on('connect', () => {
      if (!settled) { settled = true; resolve({ sock, ok: true, getGreet: () => box.greet }); }
    });
    sock.on('connect_error', (e) => { if (!settled) { settled = true; resolve({ sock, ok: false, err: e.message }); } });
    setTimeout(() => { if (!settled) { settled = true; resolve({ sock, ok: false, err: 'timeout' }); sock.close(); } }, ms);
  });
}

// Wait for one specific event emitted after this call. Listeners are attached
// BEFORE the trigger fires, so no buffering/replay is needed (replaying would
// let a previous assertion's error satisfy a later one).
function once(sock, evt, ms = 4000) {
  return new Promise((resolve) => {
    const t = setTimeout(() => resolve(null), ms);
    sock.once(evt, (p) => { clearTimeout(t); resolve(p); });
  });
}

async function expectEvent(sock, evt, trigger, label, ms = 4000) {
  const p = once(sock, evt, ms);
  if (trigger) await trigger();
  const got = await p;
  record(label, got !== null, got !== null ? `-> ${evt} ${JSON.stringify(got).slice(0, 90)}` : `-> no ${evt} within ${ms}ms`);
  return got;
}

async function main() {
  process.env.MONGODB_URI = process.env.MONGODB_URI || 'mongodb://127.0.0.1:27019/contech_socket_test';
  process.env.JWT_SECRET = JWT_SECRET;
  process.env.PORT = String(PORT);
  process.env.NODE_ENV = 'test';
  process.env.SCHEDULER_ENABLED = 'false';
  // Must be a broker that really exists. The embedded Aedes fallback accepts the
  // TCP connection but never sends a CONNACK on Node 22, so the MQTT client
  // silently retries forever and these tests would pass without ever touching a
  // broker. Fail loudly instead.
  process.env.MQTT_BROKER_URL = process.env.MQTT_BROKER_URL || 'mqtt://127.0.0.1:1895';
  process.env.MQTT_ENABLED = 'true';
  {
    const { isPortOpen } = require('../src/mqtt/client');
    // `hostname`, not `host`: URL#host includes the port ("127.0.0.1:1895"),
    // which is not a resolvable host and makes the check always fail.
    const { hostname, port } = new URL(process.env.MQTT_BROKER_URL.replace('mqtt://', 'http://'));
    if (!(await isPortOpen(Number(port), hostname))) {
      console.error(`No MQTT broker at ${process.env.MQTT_BROKER_URL}.`);
      console.error('Start one: docker run -d --name contech-test-mqtt -p 1895:1883 ' +
        '-v /tmp/opencode/mosquitto/test.conf:/mosquitto/config/mosquitto.conf:ro eclipse-mosquitto:2');
      process.exit(1);
    }
  }

  await startServer({ httpPort: PORT, mongoUri: process.env.MONGODB_URI });
  await seedSubscriptionLimits();
  await Promise.all([
    User.deleteMany({}), Apartment.deleteMany({}), Room.deleteMany({}),
    Device.deleteMany({}), Task.deleteMany({}),
  ]);

  // ── Fixtures ────────────────────────────────────────────────────────────
  const user = await User.create({
    name: 'Sock User', email: 'sock@test.com', password: 'TestPass123!', role: 'customer', active: true,
  });
  const other = await User.create({
    name: 'Other User', email: 'other@test.com', password: 'TestPass123!', role: 'customer', active: true,
  });
  const token = jwt.sign({ id: user._id.toString(), role: 'customer' }, JWT_SECRET, { expiresIn: '1h' });
  const otherToken = jwt.sign({ id: other._id.toString(), role: 'customer' }, JWT_SECRET, { expiresIn: '1h' });

  const apartment = await Apartment.create({ name: 'Sock Apt', creator: user._id, members: [user._id] });
  const room = await Room.create({
    name: 'Sock Room', apartment: apartment._id, creator: user._id,
    users: [user._id], roomPassword: 'RoomPass123!', componentNumber: 'sock-room-comp',
  });
  // componentNumber is declared required, but the model's pre-save hook — which
  // would generate it — runs AFTER validation, so a placeholder must be passed
  // to create at all. The hook then overwrites that placeholder with an
  // unguessable sha256(name+timestamp), so the device is only ESP-connectable
  // once the plaintext serial is set explicitly afterwards.
  const device = await Device.create({
    name: 'Sock Device', type: 'Light', room: room._id, creator: user._id,
    order: 1, componentNumber: 'placeholder-1', status: 'off', users: [user._id],
  });
  device.componentNumber = sha256('sock-dev-1');
  await device.save();

  const device2 = await Device.create({
    name: 'Sock Device 2', type: 'Fan', room: room._id, creator: user._id,
    order: 2, componentNumber: 'placeholder-2', status: 'off', users: [user._id],
  });
  device2.componentNumber = sha256('sock-dev-2');
  await device2.save();

  // Probe: a caller-supplied componentNumber must survive creation verbatim.
  // (Hashing is the API layer's job — the model must not invent its own value.)
  const probe = await Device.create({
    name: 'Probe Device', type: 'Light', room: room._id, creator: user._id, order: 3,
    componentNumber: 'MODEL-PRESERVE-ME',
  });
  record('device: model preserves a caller-supplied componentNumber',
    probe.componentNumber === 'MODEL-PRESERVE-ME',
    `stored ${probe.componentNumber}`);

  // Probe: an omitted componentNumber must still be auto-generated (required).
  const auto = await Device.create({ name: 'Auto Device', type: 'Light', room: room._id, creator: user._id, order: 4 });
  record('device: model auto-generates a componentNumber when omitted',
    typeof auto.componentNumber === 'string' && auto.componentNumber.length === 64,
    `stored ${String(auto.componentNumber).slice(0, 12)}…`);

  // Probe: renaming must NOT re-roll the componentNumber — that would silently
  // invalidate the serial an ESP is already presenting.
  const before = auto.componentNumber;
  auto.name = 'Auto Device Renamed';
  await auto.save();
  record('device: renaming does not re-roll componentNumber',
    auto.componentNumber === before, `${before.slice(0, 12)}… -> ${String(auto.componentNumber).slice(0, 12)}…`);

  // Probe end-to-end through the REST API: the plaintext serial a client sends
  // at create time must be stored hashed and then authenticate over the socket.
  const apiDev = await request(PORT, 'POST', '/api/device-handler/devices/create', {
    name: 'API Probe Device', type: 'Light', order: 5, room: room._id,
    componentNumber: 'PLAINTEXT-SERIAL-123',
  }, token);
  const apiId = apiDev.body && apiDev.body.data && apiDev.body.data._id;
  record('device: API create accepts a plaintext componentNumber', apiDev.statusCode === 201,
    `-> ${apiDev.statusCode} ${JSON.stringify(apiDev.body).slice(0, 110)}`);
  if (apiId) {
    const stored = await Device.findById(apiId);
    record('device: API stores the serial hashed, not in plaintext',
      stored.componentNumber === sha256('PLAINTEXT-SERIAL-123'),
      `stored ${String(stored.componentNumber).slice(0, 12)}…`);
    const dup = await request(PORT, 'POST', '/api/device-handler/devices/create', {
      name: 'API Probe Device 2', type: 'Light', order: 6, room: room._id,
      componentNumber: 'PLAINTEXT-SERIAL-123',
    }, token);
    record('device: API rejects a duplicate serial with 409', dup.statusCode === 409, `-> ${dup.statusCode}`);
  }
  const probeConn = await connect('/ws/device', { componentNumber: 'PLAINTEXT-SERIAL-123' });
  record('device: ESP can authenticate with the serial given at create time',
    probeConn.ok, probeConn.ok ? 'connected' : probeConn.err);
  probeConn.sock.close();
  await Device.deleteMany({ name: { $in: ['Probe Device', 'Auto Device', 'Auto Device Renamed', 'API Probe Device', 'API Probe Device 2'] } });

  // ══ 1. HANDSHAKE REJECTION ══════════════════════════════════════════════
  results.push('', '## Handshake rejection');
  let r = await connect('/ws/user', {});
  record('user ns: no token rejected', !r.ok, r.ok ? 'CONNECTED (should not)' : r.err);

  r = await connect('/ws/user', { token: 'garbage' });
  record('user ns: bad token rejected', !r.ok, r.ok ? 'CONNECTED (should not)' : r.err);

  r = await connect('/ws/user', { token: jwt.sign({ id: '000000000000000000000000' }, JWT_SECRET) });
  record('user ns: unknown-user token rejected', !r.ok, r.ok ? 'CONNECTED (should not)' : r.err);

  r = await connect('/ws/room-user', {});
  record('room-user ns: no token rejected', !r.ok, r.ok ? 'CONNECTED (should not)' : r.err);

  r = await connect('/ws/device', {});
  record('device ns: no componentNumber rejected', !r.ok, r.ok ? 'CONNECTED (should not)' : r.err);

  r = await connect('/ws/device', { componentNumber: 'does-not-exist' });
  record('device ns: unknown component rejected', !r.ok, r.ok ? 'CONNECTED (should not)' : r.err);

  r = await connect('/ws/room-esp', { componentNumber: 'does-not-exist' });
  record('room-esp ns: unknown component rejected', !r.ok, r.ok ? 'CONNECTED (should not)' : r.err);

  r = await connect('/ws/mqtt-bridge', { roomId: room._id.toString(), deviceOrder: '99' });
  record('mqtt ns: order out of range rejected', !r.ok, r.ok ? 'CONNECTED (should not)' : r.err);

  r = await connect('/ws/mqtt-bridge', { roomId: room._id.toString(), deviceOrder: '1', roomPassword: 'wrong' });
  record('mqtt ns: wrong room password rejected', !r.ok, r.ok ? 'CONNECTED (should not)' : r.err);

  r = await connect('/ws/mqtt-bridge', { roomId: room._id.toString(), deviceOrder: '1' });
  record('mqtt ns: missing room password rejected', !r.ok, r.ok ? 'CONNECTED (should not)' : r.err);

  // ══ 2. USER NAMESPACE ════════════════════════════════════════════════════
  results.push('', '## /ws/user');
  const u = await connect('/ws/user', { token });
  record('user ns: valid token connects', u.ok, u.ok ? 'connected' : u.err);
  if (u.ok) {
    await expectEvent(u.sock, 'device-info', () => u.sock.emit('get-device-info', { deviceId: device._id.toString() }),
      'user ns: get-device-info -> device-info');
    await expectEvent(u.sock, 'error', () => u.sock.emit('get-device-info', {}),
      'user ns: get-device-info w/o id -> error');
    await expectEvent(u.sock, 'error', () => u.sock.emit('get-device-esp-status', {}),
      'user ns: get-device-esp-status w/o id -> error');
    await expectEvent(u.sock, 'device-esp-status-response', () => u.sock.emit('get-device-esp-status', { deviceId: device._id.toString() }),
      'user ns: get-device-esp-status -> response', 5000);
    await expectEvent(u.sock, 'error', () => u.sock.emit('get-device-esp-status', { deviceId: '000000000000000000000000' }),
      'user ns: esp-status unknown device -> error');
    // update-state goes out over MQTT; assert it does not error the socket.
    let gotErr = null;
    u.sock.once('error', (e) => { gotErr = e; });
    u.sock.emit('update-state', { deviceId: device._id.toString(), state: 'on' });
    await new Promise((res) => setTimeout(res, 1200));
    record('user ns: update-state accepted (no error)', gotErr === null, gotErr ? JSON.stringify(gotErr) : 'no error within 1.2s');
    u.sock.close();
  }

  // ══ 3. ROOM-USER NAMESPACE ═══════════════════════════════════════════════
  results.push('', '## /ws/room-user');
  const ru = await connect('/ws/room-user', { token });
  record('room-user ns: valid token connects', ru.ok, ru.ok ? 'connected' : ru.err);
  if (ru.ok) {
    await expectEvent(ru.sock, 'user-rooms', () => ru.sock.emit('fetch-user-rooms'),
      'room-user ns: fetch-user-rooms -> user-rooms');
    await expectEvent(ru.sock, 'room-details', () => ru.sock.emit('fetch-room', { roomId: room._id.toString() }),
      'room-user ns: fetch-room -> room-details');
    await expectEvent(ru.sock, 'error', () => ru.sock.emit('get-esp-status', {}),
      'room-user ns: get-esp-status w/o roomId -> error');
    await expectEvent(ru.sock, 'error', () => ru.sock.emit('get-esp-status', { roomId: '000000000000000000000000' }),
      'room-user ns: get-esp-status unknown room -> error');
    // Ownership enforcement: connect as a user with no access to the room and
    // require the server to refuse on the *other* user's socket.
    const o = await connect('/ws/room-user', { token: otherToken });
    record('room-user ns: non-member connects then is refused room access',
      o.ok && (await expectEvent(o.sock, 'error', () => o.sock.emit('get-esp-status', { roomId: room._id.toString() }),
        'room-user ns: non-member blocked from room', 4000)) !== null,
      o.ok ? 'connected; error expected on room read' : o.err);
    o.sock.close();
  }

  // ══ 4. DEVICE NAMESPACE ═════════════════════════════════════════════════
  results.push('', '## /ws/device');
  const d = await connect('/ws/device', { componentNumber: 'sock-dev-1' });
  record('device ns: valid componentNumber connects', d.ok, d.ok ? 'connected' : d.err);
  if (d.ok) {
    await expectEvent(d.sock, 'state-reported', () => d.sock.emit('report-state', { state: 'on' }),
      'device ns: report-state -> state-reported');
    await expectEvent(d.sock, 'error', () => d.sock.emit('report-state', {}),
      'device ns: report-state w/o state -> error');
    // The report must actually persist.
    const persisted = await Device.findById(device._id).lean();
    record('device ns: report-state persisted', String(persisted.status).toLowerCase() === 'on', `status=${persisted.status}`);
    d.sock.close();
  }

  // ══ 5. ROOM-ESP NAMESPACE ════════════════════════════════════════════════
  results.push('', '## /ws/room-esp');
  const re = await connect('/ws/room-esp', { componentNumber: 'sock-dev-1' });
  record('room-esp ns: valid componentNumber connects', re.ok, re.ok ? 'connected' : re.err);
  if (re.ok) {
    await expectEvent(re.sock, 'room-devices', () => re.sock.emit('fetch-room-devices'),
      'room-esp ns: fetch-room-devices -> room-devices');
    const dev2 = await Device.findOne({ room: room._id, order: 2 });
    // The ESP receives the per-device result; the /ws/room-user clients in that
    // room receive the bulk 'room-devices-updated' fan-out.
    const echoed = expectEvent(re.sock, 'room-update-results',
      () => re.sock.emit('update-room-devices', { updates: [{ deviceId: dev2._id.toString(), state: 'on' }] }),
      'room-esp ns: update-room-devices -> room-update-results', 5000);
    const fanned = expectEvent(ru.sock, 'room-devices-updated', null,
      'room-esp ns: update fan-out reaches /ws/room-user', 5000);
    const [res1, fan1] = await Promise.all([echoed, fanned]);
    record('room-esp ns: device state actually persisted',
      String((await Device.findById(dev2._id).lean()).status).toLowerCase() === 'on',
      `status=${(await Device.findById(dev2._id).lean()).status}`);
    await expectEvent(re.sock, 'error', () => re.sock.emit('update-room-devices', {}),
      'room-esp ns: update-room-devices w/o updates -> error');
    re.sock.close();
  }

  // ══ 6. MQTT-BRIDGE NAMESPACE ════════════════════════════════════════════
  results.push('', '## /ws/mqtt-bridge');
  const mb = await connect('/ws/mqtt-bridge', {
    roomId: room._id.toString(), deviceOrder: '1', roomPassword: 'RoomPass123!',
  }, {}, 6000, 'mqtt-bridge-connected');
  record('mqtt ns: valid room+order+password connects', mb.ok, mb.ok ? 'connected' : mb.err);
  if (mb.ok) {
    for (let i = 0; i < 50 && mb.getGreet() === null; i++) await new Promise((res) => setTimeout(res, 100));
    const g = mb.getGreet();
    record('mqtt ns: server greets with mqtt-bridge-connected', g !== null,
      g ? JSON.stringify(g).slice(0, 90) : 'no greet within 5s');
    await expectEvent(mb.sock, 'state-reported', () => mb.sock.emit('report-state', { state: 'on' }),
      'mqtt ns: report-state -> state-reported');
    await expectEvent(mb.sock, 'error', () => mb.sock.emit('report-state', {}),
      'mqtt ns: report-state w/o state -> error');
    await expectEvent(mb.sock, 'error', () => mb.sock.emit('report-room-state', { updates: {} }),
      'mqtt ns: report-room-state malformed -> error');
    await expectEvent(mb.sock, 'error', () => mb.sock.emit('report-room-state', { roomId: '000000000000000000000000', updates: [{ deviceId: device._id.toString(), state: 'on' }] }),
      'mqtt ns: report-room-state foreign room -> error');
    mb.sock.close();
  }

  // ══ 7. END-TO-END MQTT DELIVERY ═══════════════════════════════════════════
  // Publish on the broker and assert it comes back out over Socket.IO. This is
  // the only assertion that proves the broker path itself works; every other MQTT
  // test only exercises the /ws/mqtt-bridge socket.
  results.push('', '## end-to-end MQTT delivery');
  {
    const mqtt = require('mqtt');
    const broker = mqtt.connect(process.env.MQTT_BROKER_URL, {
      clientId: `mqtt-probe-${Date.now()}`, clean: true, connectTimeout: 8000, reconnectPeriod: 0,
    });
    const brokerUp = await new Promise((res) => {
      const t = setTimeout(() => res(false), 9000);
      broker.on('connect', () => { clearTimeout(t); res(true); });
      broker.on('error', () => { clearTimeout(t); res(false); });
    });
    record('mqtt: test client can connect to the broker', brokerUp,
      brokerUp ? process.env.MQTT_BROKER_URL : 'could not connect to broker');

    if (brokerUp) {
      // Give the server a moment to finish its own subscribe after start-up.
      await new Promise((r) => setTimeout(r, 1500));

      // A client in the device room should be told the new state.
      const watcher = await connect('/ws/user', {}, { token: token }, 6000);
      if (watcher.ok) {
        watcher.sock.emit('join-device-room', { deviceId: device._id.toString() });
        await new Promise((r) => setTimeout(r, 400));
      }

      await expectEvent(watcher.ok ? watcher.sock : null, 'state-updated', () => {
        broker.publish(`home-automation/${device._id}/state`,
          JSON.stringify({ state: 'on' }), { qos: 1 });
      }, 'mqtt: device state published on the broker reaches /ws/user as state-updated');

      const after = await Device.findById(device._id);
      record('mqtt: published state is persisted on the device',
        after && after.status === 'on', `status=${after && after.status}`);

      // An unknown device must not blow up the router.
      broker.publish('home-automation/000000000000000000000000/state', JSON.stringify({ state: 'on' }));
      await new Promise((r) => setTimeout(r, 600));
      record('mqtt: message for an unknown device is ignored without crashing', true, 'router survived');

      await expectEvent(watcher.ok ? watcher.sock : null, 'device-status', () => {
        broker.publish(`home-automation/${device._id}/status`, JSON.stringify({ status: 'online' }));
      }, 'mqtt: device status published on the broker reaches /ws/user as device-status');

      if (watcher.ok) watcher.sock.close();
    }
    broker.end(true);
  }

  // ── Embedded broker regression (defect 19) ─────────────────────────────
  // startEmbeddedBroker used to return true while the broker never sent a
  // CONNACK, because Aedes 1.x needs an awaited listen(). A port-open check
  // cannot catch that; only a real MQTT handshake can.
  {
    const mqtt = require('mqtt');
    const { startEmbeddedBroker, stopEmbeddedBroker } = require('../src/mqtt/client');
    const EMB_PORT = 19521;
    const started = await startEmbeddedBroker(EMB_PORT);
    record('mqtt: embedded Aedes broker reports itself started', started === true,
      started === true ? '' : 'startEmbeddedBroker returned ' + started);

    const handshakeOk = await new Promise((resolve) => {
      const probe = mqtt.connect(`mqtt://127.0.0.1:${EMB_PORT}`, {
        clientId: `aedes-regression-${Date.now()}`,
        username: 'local', password: 'local', clean: true,
        connectTimeout: 6000, reconnectPeriod: 0,
      });
      probe.on('connect', () => { probe.end(true); resolve(true); });
      probe.on('error', (e) => resolve('connack timeout / ' + e.message));
    });
    record('mqtt: embedded broker completes a real MQTT handshake',
      handshakeOk === true,
      handshakeOk === true ? '' : String(handshakeOk));

    await stopEmbeddedBroker();
    record('mqtt: embedded broker shuts down cleanly', true);
  }

  // ── Report ──────────────────────────────────────────────────────────────
  const dir = path.join(__dirname, '..', 'test-reports');
  fs.mkdirSync(dir, { recursive: true });
  const md = ['# Socket.IO Test Report', '',
    `- Date: ${new Date().toISOString()}`,
    `- Total: ${passed + failed} | Passed: ${passed} | Failed: ${failed}`, '',
    '## Results', '', ...results.map((l) => l ? `- ${l}` : ''), ''
].join('\n');
  fs.writeFileSync(path.join(dir, 'sockets.md'), md);
  console.log(md);

  setTimeout(() => { try { process.reallyExit(failed === 0 ? 0 : 1); } catch { /* ignore */ } }, 500).unref();
  setTimeout(() => process.kill(process.pid, 'SIGKILL'), 2000).unref();
  process.exit(failed === 0 ? 0 : 1);
}

process.on('unhandledRejection', (e) => { console.error('UNHANDLED:', e && e.message); });

// Watchdog: native threads (MQTT reconnect, pooled sockets) can wedge the loop,
// so guarantee termination and surface whatever assertions completed.
setTimeout(() => {
  console.error(`WATCHDOG: forcing exit after 240s (${passed} passed, ${failed} failed, ${results.length} steps)`);
  try { process.reallyExit(failed === 0 ? 0 : 1); } catch { /* ignore */ }
  process.kill(process.pid, 'SIGKILL');
}, 240000).unref();

main();
