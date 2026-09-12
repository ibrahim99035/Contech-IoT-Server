#!/usr/bin/env node
require('dotenv').config();
const http = require('http');
const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');

const PORT = process.env.PORT || '5000';
const TS = Date.now();
const P = `test-${TS}-`;

const ADMIN = { email: `admin-${TS}@test.local`, password: 'Admin@123', name: `Admin ${TS}` };
const USER = { email: `user-${TS}@test.local`, password: 'User@123', name: `User ${TS}` };

let adminToken, userToken, adminId, userId, aptId, roomId, devId, taskId, planId;
let passed = 0, failed = 0;

function api(m, p, b = null, t = null) {
  return new Promise((resolve) => {
    const req = http.request({
      hostname: 'localhost', port: PORT, path: p.startsWith('/') ? p : `/${p}`,
      method: m,
      headers: { 'Content-Type': 'application/json', 'Accept': 'application/json', ...(t ? { Authorization: `Bearer ${t}` } : {}) }
    }, res => {
      let d = '';
      res.on('data', c => d += c);
      res.on('end', () => {
        try { resolve({ status: res.statusCode, data: JSON.parse(d) }); }
        catch { resolve({ status: res.statusCode, data: d }); }
      });
    });
    req.on('error', e => resolve({ status: 0, error: e.message }));
    b && req.write(JSON.stringify(b));
    req.end();
  });
}

function test(name, ok, detail = '') {
  if (ok) { passed++; console.log(`  ✅ ${name}`); }
  else { failed++; console.log(`  ❌ ${name}${detail ? ' - ' + detail : ''}`); }
}

async function createUser(creds, role) {
  try {
    await mongoose.connect(process.env.MONGODB_URI);
    const db = mongoose.connection.db;
    const hash = await bcrypt.hash(creds.password, 10);
    const existing = await db.collection('users').findOne({ email: creds.email });
    if (existing) return { _id: existing._id };
    const r = await db.collection('users').insertOne({
      name: creds.name, email: creds.email, password: hash, role,
      active: true, emailActivated: true, apartments: [], devices: [], tasks: [],
      createdAt: new Date(), updatedAt: new Date()
    });
    return { _id: r.insertedId };
  } catch (e) { console.error('Error:', e.message); return null; }
}

async function login(creds) {
  const r = await api('POST', '/api/auth/login', creds);
  return (r.status === 200 && r.data?.data?.token) ? r.data.data.token : null;
}

async function cleanup() {
  console.log('\n🧹 Cleanup...');
  try {
    await mongoose.connect(process.env.MONGODB_URI);
    const db = mongoose.connection.db;
    for (const col of ['users', 'apartments', 'rooms', 'devices', 'tasks']) {
      const r = await db.collection(col).deleteMany({
        $or: [{ name: { $regex: `^test-${TS}` } }, { email: { $regex: `^test-${TS}` } }]
      });
      if (r.deletedCount) console.log(`   ${col}: ${r.deletedCount}`);
    }
    await mongoose.connection.close();
  } catch (e) { console.error('Cleanup error:', e.message); }
}

console.log('╔══════════════════════════════════════════════════════╗');
console.log('║  Contech IoT API Test Suite - Idempotent           ║');
console.log(`║  Time: ${new Date(TS).toISOString()}          ║`);
console.log('╚══════════════════════════════════════════════════════╝');
console.log(`\n📝 Admin: ${ADMIN.email} / ${ADMIN.password}`);
console.log(`📝 User:  ${USER.email} / ${USER.password}\n`);

module.exports = { api, test, createUser, login, cleanup, P, TS, ADMIN, USER, 
  state: { adminToken, userToken, adminId, userId, aptId, roomId, devId, taskId, planId, passed, failed } };
