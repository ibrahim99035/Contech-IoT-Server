#!/usr/bin/env node
/**
 * Contech IoT - Idempotent API Test Suite
 * Tests every endpoint with unique timestamped data.
 * Usage: node test-idempotent.js [--cleanup]
 */
require('dotenv').config();
const http = require('http');
const mongoose = require('mongoose');

const PORT = process.env.PORT || '5000';
const TS = Date.now();
const PREFIX = 't' + TS + '-';

const ADMIN = { email: PREFIX + 'admin@test.local', password: 'Admin@123', name: 'Test Admin' };
const USER = { email: PREFIX + 'user@test.local', password: 'User@123', name: 'Test User' };

let adminToken, userToken, userId, aptId, roomId, devId, taskId, planId;
let passed = 0, failed = 0;

function api(method, path, body = null, token = null) {
  return new Promise((resolve) => {
    const req = http.request({
      hostname: 'localhost', port: PORT,
      path: path.startsWith('/') ? path : '/' + path,
      method,
      headers: { 'Content-Type': 'application/json', 'Accept': 'application/json',
        ...(token ? { Authorization: 'Bearer ' + token } : {}) }
    }, res => {
      let data = '';
      res.on('data', c => data += c);
      res.on('end', () => {
        try { resolve({ status: res.statusCode, data: JSON.parse(data) }); }
        catch { resolve({ status: res.statusCode, data }); }
      });
    });
    req.on('error', e => resolve({ status: 0, error: e.message }));
    if (body) req.write(JSON.stringify(body));
    req.end();
  });
}

function test(name, ok, detail = '') {
  if (ok) { passed++; console.log('  \u2705 ' + name); }
  else { failed++; console.log('  \u274c ' + name + (detail ? ' - ' + detail : '')); }
}

async function register(creds, role) {
  await api('POST', '/api/auth/register', { ...creds, role });
  const r = await api('POST', '/api/auth/login', creds);
  if (r.status === 200 && r.data && r.data.data && r.data.data.token) {
    return { token: r.data.data.token, id: r.data.data._id };
  }
  return null;
}

async function cleanup() {
  console.log('\nCleaning up test data...');
  try {
    await mongoose.connect(process.env.MONGODB_URI);
    const db = mongoose.connection.db;
    const re = '^t[0-9]{13}-';
    for (const col of ['users', 'apartments', 'rooms', 'devices', 'tasks', 'subscriptions', 'payments', 'subscriptionplans', 'coupons']) {
      const r = await db.collection(col).deleteMany({
        $or: [{ name: { $regex: re } }, { email: { $regex: re } }, { code: { $regex: re } }]
      });
      if (r.deletedCount) console.log('  ' + col + ': ' + r.deletedCount + ' removed');
    }
    await mongoose.connection.close();
    console.log('Cleanup complete\n');
  } catch (e) { console.error('Cleanup error:', e.message); }
}

async function run() {
  console.log('================================================');
  console.log('Contech IoT - Idempotent API Test Suite');
  console.log('Run ID: ' + TS);
  console.log('================================================');
  console.log('Test accounts:');
  console.log('  Admin: ' + ADMIN.email);
  console.log('  User:  ' + USER.email);

  // 1. Health
  console.log('\n1. Health Check');
  const h = await api('GET', '/health');
  test('Health endpoint', h.status === 200);

  // 2. Admin
  console.log('\n2. Admin Account');
  const admin = await register(ADMIN, 'customer');
  if (admin) { adminToken = admin.token; test('Admin registered & logged in', true); }
  else test('Admin setup', false);

  // 3. User
  console.log('\n3. User Account');
  const user = await register(USER, 'customer');
  if (user) { userToken = user.token; userId = user.id; test('User registered & logged in', true); }
  else test('User setup', false);

  // 4. Auth
  console.log('\n4. Auth Endpoints');
  if (userToken) {
    const v = await api('GET', '/api/auth/verify', null, userToken);
    test('Verify token', v.status === 200);
  }

  // 5. Apartments
  console.log('\n5. Apartments');
  if (userToken) {
    const ca = await api('POST', '/api/apartments-handler/apartments/create-apartment', {
      name: PREFIX + 'Apt', creator: String(userId)
    }, userToken);
    test('Create apartment', ca.status === 201, 'Status: ' + ca.status);
    if (ca.status === 201) aptId = ca.data.data._id;
    if (aptId) {
      const ua = await api('PUT', '/api/apartments-handler/apartments/update-name', { id: aptId, name: PREFIX + 'AptUpdated' }, userToken);
      test('Update apartment', ua.status === 200);
      const m = await api('GET', '/api/apartments-handler/apartments/' + aptId + '/members', null, userToken);
      test('Get members', m.status === 200);
      const da = await api('DELETE', '/api/apartments-handler/apartments/delete/' + aptId, null, userToken);
      test('Delete apartment', da.status === 200);
    }
  }

  // 6. Rooms
  console.log('\n6. Rooms');
  if (userToken) {
    const ca = await api('POST', '/api/apartments-handler/apartments/create-apartment', { name: PREFIX + 'RoomApt', creator: String(userId) }, userToken);
    if (ca.status === 201) {
      aptId = ca.data.data._id;
      const cr = await api('POST', '/api/rooms-handler/rooms/create', { name: PREFIX + 'Room', apartment: aptId, roomPassword: 'Rp123' }, userToken);
      test('Create room', cr.status === 201, 'Status: ' + cr.status);
      if (cr.status === 201) roomId = cr.data.data.room ? cr.data.data.room._id : cr.data.data._id;
      if (roomId) {
        const dr = await api('DELETE', '/api/rooms-handler/rooms/delete/' + roomId, null, userToken);
        test('Delete room', dr.status === 200);
      }
      await api('DELETE', '/api/apartments-handler/apartments/delete/' + aptId, null, userToken);
    }
  }

  // 7. Devices
  console.log('\n7. Devices');
  if (userToken) {
    const ca = await api('POST', '/api/apartments-handler/apartments/create-apartment', { name: PREFIX + 'DevApt', creator: String(userId) }, userToken);
    if (ca.status === 201) {
      aptId = ca.data.data._id;
      const cr = await api('POST', '/api/rooms-handler/rooms/create', { name: PREFIX + 'DevRoom', apartment: aptId, roomPassword: 'Rp123' }, userToken);
      roomId = cr.status === 201 ? (cr.data.data.room ? cr.data.data.room._id : cr.data.data._id) : null;
      if (roomId) {
        const cd = await api('POST', '/api/device-handler/devices/create', { name: PREFIX + 'Dev', room: roomId, type: 'Light', order: 1 }, userToken);
        test('Create device', cd.status === 201, 'Status: ' + cd.status);
        if (cd.status === 201) devId = cd.data.data._id;
        if (devId) {
          const dd = await api('DELETE', '/api/device-handler/devices/delete/' + devId, null, userToken);
          test('Delete device', dd.status === 200);
        }
      }
      await api('DELETE', '/api/rooms-handler/rooms/delete/' + roomId, null, userToken).catch(() => {});
      await api('DELETE', '/api/apartments-handler/apartments/delete/' + aptId, null, userToken);
    }
  }

  // 8. Tasks
  console.log('\n8. Tasks');
  if (userToken) {
    const ca = await api('POST', '/api/apartments-handler/apartments/create-apartment', { name: PREFIX + 'TaskApt', creator: String(userId) }, userToken);
    if (ca.status === 201) {
      aptId = ca.data.data._id;
      const cr = await api('POST', '/api/rooms-handler/rooms/create', { name: PREFIX + 'TaskRoom', apartment: aptId, roomPassword: 'Rp123' }, userToken);
      roomId = cr.status === 201 ? (cr.data.data.room ? cr.data.data.room._id : cr.data.data._id) : null;
      if (roomId) {
        const cd = await api('POST', '/api/device-handler/devices/create', { name: PREFIX + 'TaskDev', room: roomId, type: 'Light', order: 1 }, userToken);
        devId = cd.status === 201 ? cd.data.data._id : null;
        if (devId) {
          const ct = await api('POST', '/api/task-handler/tasks/create-task', {
            name: PREFIX + 'Task', device: devId, timezone: 'UTC',
            action: { type: 'status_change', value: 'on' },
            schedule: { startDate: new Date().toISOString(), startTime: '10:00', recurrence: { type: 'once', interval: 1 } },
            notifications: { enabled: false, recipients: [], onFailure: true }
          }, userToken);
          test('Create task', ct.status === 201, 'Status: ' + ct.status);
          if (ct.status === 201) taskId = ct.data.data._id;
          if (taskId) {
            const dt = await api('DELETE', '/api/task-handler/tasks/delete-task/' + taskId, null, userToken);
            test('Delete task', dt.status === 200);
          }
        }
        await api('DELETE', '/api/device-handler/devices/delete/' + devId, null, userToken).catch(() => {});
      }
      await api('DELETE', '/api/rooms-handler/rooms/delete/' + roomId, null, userToken).catch(() => {});
      await api('DELETE', '/api/apartments-handler/apartments/delete/' + aptId, null, userToken);
    }
  }

  // 9. Subscriptions
  console.log('\n9. Subscriptions');
  const plans = await api('GET', '/api/subscription/plans');
  test('Get plans', plans.status === 200);
  if (plans.data && plans.data.length) planId = plans.data[0]._id;

  if (userToken && planId) {
    const sub = await api('POST', '/api/subscription', { subscriptionPlanId: planId }, userToken);
    test('Subscribe', sub.status === 200 || sub.status === 201, 'Status: ' + sub.status);
    const my = await api('GET', '/api/subscription/my', null, userToken);
    test('Get my subscription', my.status === 200);
    const pay = await api('POST', '/api/subscription/payments', { userId: String(userId), subscriptionPlanId: planId, amount: 99, currency: 'USD', paymentMethod: 'test', paymentStatus: 'pending' }, userToken);
    test('Create payment', pay.status === 200 || pay.status === 201, 'Status: ' + pay.status);
    const cancel = await api('DELETE', '/api/subscription/', { cancellationReason: 'test' }, userToken);
    test('Cancel subscription', cancel.status === 200);
  }

  // Summary
  console.log('\n================================================');
  console.log('TEST SUMMARY');
  console.log('================================================');
  console.log('Total: ' + (passed + failed) + ' | Passed: ' + passed + ' | Failed: ' + failed);
  console.log('Success rate: ' + ((passed / (passed + failed)) * 100).toFixed(1) + '%');
  console.log('Run ID: ' + TS);
  console.log('Cleanup: node test-idempotent.js --cleanup');

  try { await mongoose.disconnect(); } catch (e) {}
}

const arg = process.argv[2];
if (arg === '--cleanup') {
  cleanup().then(() => process.exit(0));
} else {
  run().then(() => process.exit(0)).catch(e => { console.error(e); process.exit(1); });
}
