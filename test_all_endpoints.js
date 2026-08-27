/**
 * Comprehensive Endpoint Automated Test Runner
 * Contech-IoT-Server
 */

'use strict';

process.env.MONGODB_URI = process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/contech_test_db';
process.env.JWT_SECRET = process.env.JWT_SECRET || 'test_jwt_secret_key_12345';
process.env.PORT = '5001';
process.env.NODE_ENV = 'test';

const http = require('http');
const connectDB = require('./src/config/db');
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');

const authRoutes = require('./src/routes/authRoutes');
const apartmentRoutes = require('./src/routes/apartmentRoutes');
const roomRoutes = require('./src/routes/roomRoutes');
const deviceRoutes = require('./src/routes/deviceRoutes');
const taskRoutes = require('./src/routes/taskRoutes');
const imageRoutes = require('./src/adminRoutes/imageRoutes');
const googleAssistantRoutes = require('./src/routes/googleAssistantRoutes');

const apartmentAdminRoutes = require('./src/adminRoutes/apartmentAdminRoutes');
const userAdminRoutes = require('./src/adminRoutes/userAdminRoutes');
const roomAdminRoutes = require('./src/adminRoutes/roomAdminRoutes');
const deviceAdminRoutes = require('./src/adminRoutes/deviceAdminRoutes');
const taskAdminRoutes = require('./src/adminRoutes/taskAdminRoutes');
const limitsRoutes = require('./src/adminRoutes/LimitsRoutes');

const setupSwagger = require('./src/config/swagger');
const seedSubscriptionLimits = require('./src/scripts/seedSubscriptionLimits');

const User = require('./src/models/User');
const jwt = require('jsonwebtoken');

let server;
let app;
let userToken = '';
let adminToken = '';
let createdUserId = '';
let createdAdminId = '';
let apartmentId = '';
let roomId = '';
let deviceId = '';
let taskId = '';

async function request(method, path, body = null, token = null) {
  return new Promise((resolve, reject) => {
    const data = body ? JSON.stringify(body) : '';
    const req = http.request({
      hostname: '127.0.0.1',
      port: 5001,
      path: path,
      method: method,
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(data),
        ...(token ? { 'Authorization': `Bearer ${token}` } : {})
      }
    }, (res) => {
      let responseBody = '';
      res.on('data', chunk => responseBody += chunk);
      res.on('end', () => {
        let json = null;
        try {
          json = JSON.parse(responseBody);
        } catch (e) {
          json = responseBody;
        }
        resolve({ statusCode: res.statusCode, body: json });
      });
    });

    req.on('error', reject);
    if (data) req.write(data);
    req.end();
  });
}

async function runTests() {
  console.log('🚀 Starting Comprehensive Endpoint Test Suite...\n');

  try {
    await connectDB();
    await seedSubscriptionLimits();

    app = express();

    app.use(helmet({ contentSecurityPolicy: false }));
    app.use(express.json({ limit: '5mb' }));
    app.use(cors());

    setupSwagger(app);

    // REST API Routes
    app.use('/api/auth', authRoutes);
    app.use('/api/apartments-handler', apartmentRoutes);
    app.use('/api/rooms-handler', roomRoutes);
    app.use('/api/device-handler', deviceRoutes);
    app.use('/api/task-handler', taskRoutes);
    app.use('/api/images', imageRoutes);
    app.use('/api/google-assistant', googleAssistantRoutes);

    // Administrative REST Dashboard Routes
    app.use('/admin/dashboard/apartments', apartmentAdminRoutes);
    app.use('/admin/dashboard/users', userAdminRoutes);
    app.use('/admin/dashboard/rooms', roomAdminRoutes);
    app.use('/admin/dashboard/devices', deviceAdminRoutes);
    app.use('/admin/dashboard/tasks', taskAdminRoutes);
    app.use('/admin/dashboard/subscription-limits', limitsRoutes);

    server = http.createServer(app);
    await new Promise(resolve => server.listen(5001, resolve));
    console.log('✅ Test Server listening on http://127.0.0.1:5001\n');

    // Reset test users
    await User.deleteMany({ email: { $in: ['testuser@contech.com', 'adminuser@contech.com'] } });
    
    const user = await User.create({
      name: 'Test Regular User',
      email: 'testuser@contech.com',
      password: 'Password123!',
      role: 'customer',
      emailActivated: true
    });
    createdUserId = user._id.toString();
    userToken = jwt.sign({ id: createdUserId, role: 'customer' }, process.env.JWT_SECRET, { expiresIn: '1d' });

    const admin = await User.create({
      name: 'Test Admin User',
      email: 'adminuser@contech.com',
      password: 'AdminPassword123!',
      role: 'admin',
      emailActivated: true
    });
    createdAdminId = admin._id.toString();
    adminToken = jwt.sign({ id: createdAdminId, role: 'admin' }, process.env.JWT_SECRET, { expiresIn: '1d' });

    // Dynamic test cases pipeline with complete field matching
    const testCases = [
      // 1. Documentation & Specs
      { group: 'Swagger', method: 'GET', path: '/api-docs/json', token: null, expectedStatus: 200 },
      
      // 2. Authentication
      { group: 'Auth', method: 'GET', path: '/api/auth/verify', token: userToken, expectedStatus: 200 },
      { group: 'Auth', method: 'POST', path: '/api/auth/login', body: { email: 'testuser@contech.com', password: 'Password123!' }, token: null, expectedStatus: 200 },
      { group: 'Auth', method: 'POST', path: '/api/auth/login', body: { email: 'wrong@contech.com', password: 'bad' }, token: null, expectedStatus: 401 },

      // 3. Apartments
      { 
        group: 'Apartments', 
        method: 'POST', 
        path: '/api/apartments-handler/apartments/create-apartment', 
        body: () => ({ name: 'Automated Test Apartment', creator: createdUserId }), 
        token: userToken, 
        expectedStatus: 201,
        after: (res) => { 
          if (res.body?.data?._id) {
            apartmentId = res.body.data._id;
          }
        }
      },
      { group: 'Apartments', method: 'GET', path: '/api/apartments-handler/apartments/member', token: userToken, expectedStatus: 200 },
      { 
        group: 'Apartments', 
        method: 'GET', 
        path: () => `/api/apartments-handler/apartments/${apartmentId}/members`, 
        token: userToken, 
        expectedStatus: 200 
      },
      { 
        group: 'Apartments', 
        method: 'PUT', 
        path: '/api/apartments-handler/apartments/update-name', 
        body: () => ({ apartmentId: apartmentId, name: 'Renamed Test Apartment' }), 
        token: userToken, 
        expectedStatus: 200 
      },

      // 4. Rooms
      { 
        group: 'Rooms', 
        method: 'POST', 
        path: '/api/rooms-handler/rooms/create', 
        body: () => ({ name: 'Test Master Bedroom', apartment: apartmentId, type: 'bedroom', roomPassword: 'RoomPassword123!' }), 
        token: userToken, 
        expectedStatus: 201,
        after: (res) => { 
          if (res.body?.data?.room?._id) {
            roomId = res.body.data.room._id;
          }
        }
      },
      { group: 'Rooms', method: 'GET', path: '/api/rooms-handler/rooms/user/get-all', token: userToken, expectedStatus: 200 },
      { 
        group: 'Rooms', 
        method: 'GET', 
        path: () => `/api/rooms-handler/rooms/apartment/${apartmentId}`, 
        token: userToken, 
        expectedStatus: 200 
      },
      { 
        group: 'Rooms', 
        method: 'PUT', 
        path: () => `/api/rooms-handler/rooms/${roomId}/update-name`, 
        body: { name: 'Updated Master Bedroom' }, 
        token: userToken, 
        expectedStatus: 200 
      },
      { 
        group: 'Rooms', 
        method: 'GET', 
        path: () => `/api/rooms-handler/rooms/get-users/${roomId}`, 
        token: userToken, 
        expectedStatus: 200 
      },

      // 5. Devices
      { 
        group: 'Devices', 
        method: 'POST', 
        path: '/api/device-handler/devices/create', 
        body: () => ({ name: 'Smart Switch 1', room: roomId, type: 'Light', order: 1, componentNumber: '1' }), 
        token: userToken, 
        expectedStatus: 201,
        after: (res) => { 
          if (res.body?.data?.device?._id) {
            deviceId = res.body.data.device._id;
          }
        }
      },
      { 
        group: 'Devices', 
        method: 'GET', 
        path: () => `/api/device-handler/devices/room/${roomId}`, 
        token: userToken, 
        expectedStatus: 200 
      },
      { 
        group: 'Devices', 
        method: 'PUT', 
        path: () => `/api/device-handler/devices/${deviceId}/update-name`, 
        body: { name: 'Renamed Smart Switch' }, 
        token: userToken, 
        expectedStatus: 200 
      },
      { 
        group: 'Devices', 
        method: 'PUT', 
        path: () => `/api/device-handler/devices/${deviceId}/toggle-activation`, 
        token: userToken, 
        expectedStatus: 200 
      },
      { 
        group: 'Devices', 
        method: 'GET', 
        path: () => `/api/device-handler/devices/room/${roomId}/orders`, 
        token: userToken, 
        expectedStatus: 200 
      },

      // 6. Tasks
      { 
        group: 'Tasks', 
        method: 'POST', 
        path: '/api/task-handler/tasks/create-task', 
        body: () => ({ 
          name: 'Night Shutdown Task', 
          device: deviceId, 
          action: { type: 'status_change', value: 'off' },
          schedule: {
            startDate: new Date(Date.now() + 86400000).toISOString(),
            startTime: '23:00',
            recurrence: { type: 'once' }
          },
          timezone: 'Africa/Cairo'
        }), 
        token: userToken, 
        expectedStatus: 201,
        after: (res) => { 
          if (res.body?.data?.task?._id) {
            taskId = res.body.data.task._id;
          }
        }
      },
      { group: 'Tasks', method: 'GET', path: '/api/task-handler/tasks/user/my-tasks', token: userToken, expectedStatus: 200 },
      { 
        group: 'Tasks', 
        method: 'GET', 
        path: () => `/api/task-handler/tasks/get-tasks/device/${deviceId}`, 
        token: userToken, 
        expectedStatus: 200 
      },
      { 
        group: 'Tasks', 
        method: 'GET', 
        path: () => `/api/task-handler/tasks/get-task/${taskId}`, 
        token: userToken, 
        expectedStatus: 200 
      },
      { 
        group: 'Tasks', 
        method: 'PUT', 
        path: () => `/api/task-handler/tasks/${taskId}/status`, 
        body: { status: 'cancelled' }, 
        token: userToken, 
        expectedStatus: 200 
      },

      // 7. Subscription Limits
      { group: 'Limits', method: 'GET', path: '/admin/dashboard/subscription-limits/get-usage', token: userToken, expectedStatus: 200 },
      { group: 'Limits', method: 'GET', path: '/admin/dashboard/subscription-limits/get-limits', token: adminToken, expectedStatus: 200 },

      // 8. Admin Dashboard
      { group: 'Admin Users', method: 'GET', path: '/admin/dashboard/users/get-all-users', token: adminToken, expectedStatus: 200 },
      { group: 'Admin Users', method: 'GET', path: '/admin/dashboard/users/user-statistics', token: adminToken, expectedStatus: 200 },
      { group: 'Admin Apartments', method: 'GET', path: '/admin/dashboard/apartments/all-apartments', token: adminToken, expectedStatus: 200 },
      { group: 'Admin Apartments', method: 'GET', path: '/admin/dashboard/apartments/apartment-statistics', token: adminToken, expectedStatus: 200 },
      { group: 'Admin Rooms', method: 'GET', path: '/admin/dashboard/rooms/get-all-rooms', token: adminToken, expectedStatus: 200 },
      { group: 'Admin Rooms', method: 'GET', path: '/admin/dashboard/rooms/room-statistics', token: adminToken, expectedStatus: 200 },
      { group: 'Admin Devices', method: 'GET', path: '/admin/dashboard/devices/get-all-devices', token: adminToken, expectedStatus: 200 },
      { group: 'Admin Devices', method: 'GET', path: '/admin/dashboard/devices/get-device-statistics', token: adminToken, expectedStatus: 200 },
      { group: 'Admin Tasks', method: 'GET', path: '/admin/dashboard/tasks/get-all-tasks', token: adminToken, expectedStatus: 200 },
      { group: 'Admin Tasks', method: 'GET', path: '/admin/dashboard/tasks/get-task-analytics', token: adminToken, expectedStatus: 200 },

      // 9. Images Public Endpoints
      { group: 'Images', method: 'GET', path: '/api/images/list', token: null, expectedStatus: 200 },
      { group: 'Images', method: 'GET', path: '/api/images/analytics/stats', token: null, expectedStatus: 200 },

      // 10. Cleanup Operations
      { 
        group: 'Cleanup', 
        method: 'DELETE', 
        path: () => `/api/task-handler/tasks/delete-task/${taskId}`, 
        token: userToken, 
        expectedStatus: 200 
      },
      { 
        group: 'Cleanup', 
        method: 'DELETE', 
        path: () => `/api/device-handler/devices/delete/${deviceId}`, 
        token: userToken, 
        expectedStatus: 200 
      },
      { 
        group: 'Cleanup', 
        method: 'DELETE', 
        path: () => `/api/rooms-handler/rooms/delete/${roomId}`, 
        token: userToken, 
        expectedStatus: 200 
      },
      { 
        group: 'Cleanup', 
        method: 'DELETE', 
        path: () => `/api/apartments-handler/apartments/delete/${apartmentId}`, 
        token: userToken, 
        expectedStatus: 200 
      }
    ];

    console.log(`📋 Running ${testCases.length} REST endpoint verification checks...\n`);

    let passedCount = 0;
    let failedCount = 0;

    for (const tc of testCases) {
      const p = typeof tc.path === 'function' ? tc.path() : tc.path;
      const b = typeof tc.body === 'function' ? tc.body() : tc.body;

      try {
        const res = await request(tc.method, p, b, tc.token);
        const pass = res.statusCode === tc.expectedStatus;

        if (pass) {
          passedCount++;
          console.log(`  ✅ [${tc.group}] ${tc.method} ${p} -> ${res.statusCode} OK`);
        } else {
          failedCount++;
          console.log(`  ❌ [${tc.group}] ${tc.method} ${p} -> Expected ${tc.expectedStatus}, got ${res.statusCode}`);
          console.log(`     Response Body: ${JSON.stringify(res.body)}`);
        }

        if (tc.after) tc.after(res);
      } catch (err) {
        failedCount++;
        console.log(`  💥 [${tc.group}] ${tc.method} ${p} -> Error: ${err.message}`);
      }
    }

    console.log(`\n==================================================`);
    console.log(`📊 Test Summary: Total: ${testCases.length} | Passed: ${passedCount} | Failed: ${failedCount}`);
    console.log(`==================================================\n`);

  } catch (err) {
    console.error('Fatal test runner error:', err);
  } finally {
    if (server) server.close();
    process.exit(0);
  }
}

runTests();
