/**
 * Full-stack test bootstrap.
 * Boots the app EXACTLY like server.js does — Express + HTTP + Socket.io +
 * all 5 WebSocket namespaces + MQTT client/broker — so endpoint, socket and
 * MQTT simulations exercise the real production surface (not a stubbed app).
 *
 * It deliberately does NOT start the BullMQ TaskScheduler (Redis-backed) or
 * AdminJS, so tests run hermetically against a throwaway local MongoDB.
 *
 * Returns { app, server, io, httpPort, mqttPort }.
 */

'use strict';

const http = require('http');
const crypto = require('crypto');
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const socketIo = require('socket.io');

const connectDB = require('../../src/config/db');
const setupSwagger = require('../../src/config/swagger');

const authRoutes = require('../../src/routes/authRoutes');
const apartmentRoutes = require('../../src/routes/apartmentRoutes');
const roomRoutes = require('../../src/routes/roomRoutes');
const deviceRoutes = require('../../src/routes/deviceRoutes');
const taskRoutes = require('../../src/routes/taskRoutes');
const imageRoutes = require('../../src/adminRoutes/imageRoutes');
const googleAssistantRoutes = require('../../src/routes/googleAssistantRoutes');
const subscriptionRoutes = require('../../src/routes/subscriptionRoutes');

const apartmentAdminRoutes = require('../../src/adminRoutes/apartmentAdminRoutes');
const userAdminRoutes = require('../../src/adminRoutes/userAdminRoutes');
const roomAdminRoutes = require('../../src/adminRoutes/roomAdminRoutes');
const deviceAdminRoutes = require('../../src/adminRoutes/deviceAdminRoutes');
const taskAdminRoutes = require('../../src/adminRoutes/taskAdminRoutes');
const limitsRoutes = require('../../src/adminRoutes/LimitsRoutes');

const { notFound } = require('../../src/middleware/notFound');
const { errorHandler } = require('../../src/middleware/errorHandler');

const logger = require('../../src/config/logger');

// On low-memory dev machines the event loop can stall long enough for the
// driver to drop loopback connections. Mongoose's default 10s buffering
// timeout then rejects queued writes mid-request and wedges the suite.
// Give queued operations up to 2 minutes to ride out a reconnect.
const mongoose = require('mongoose');
mongoose.set('bufferTimeoutMS', 120000);

let server;
let io;

async function startServer({ httpPort = process.env.PORT || 5090, mongoUri = process.env.MONGODB_URI } = {}) {
  // Connect to MongoDB first (reuses db.js retry + fallback behaviour).
  const prevMongo = process.env.MONGODB_URI;
  process.env.MONGODB_URI = mongoUri;
  await connectDB();
  if (prevMongo) process.env.MONGODB_URI = prevMongo;

  const app = express();
  server = http.createServer(app);
  app.set('trust proxy', 1);

  const ioOptions = {
    cors: { origin: '*', methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH'] },
    pingTimeout: 60000,
    pingInterval: 25000
  };
  io = socketIo(server, ioOptions);
  app.set('io', io);

  // WebSockets + MQTT (all 5 namespaces, embedded client/broker wiring).
  require('../../src/websockets')(io);

  app.use(helmet({ contentSecurityPolicy: false }));
  app.use((req, res, next) => {
    req.id = req.headers['x-request-id'] || crypto.randomUUID();
    res.setHeader('X-Request-Id', req.id);
    next();
  });
  app.use(express.json({ limit: '5mb' }));
  app.use(cors({ origin: '*', methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH'] }));

  setupSwagger(app);

  // REST API routes (same mounts as server.js)
  app.use('/api/auth', authRoutes);
  app.use('/api/apartments-handler', apartmentRoutes);
  app.use('/api/rooms-handler', roomRoutes);
  app.use('/api/device-handler', deviceRoutes);
  app.use('/api/task-handler', taskRoutes);
  app.use('/api/images', imageRoutes);
  app.use('/api/google-assistant', googleAssistantRoutes);
  app.use('/api/subscription', subscriptionRoutes);

  // Admin dashboard routes
  app.use('/admin/dashboard/apartments', apartmentAdminRoutes);
  app.use('/admin/dashboard/users', userAdminRoutes);
  app.use('/admin/dashboard/rooms', roomAdminRoutes);
  app.use('/admin/dashboard/devices', deviceAdminRoutes);
  app.use('/admin/dashboard/tasks', taskAdminRoutes);
  app.use('/admin/dashboard/subscription-limits', limitsRoutes);

  app.get('/health', (req, res) => res.status(200).json({ status: 'OK' }));

  app.use(notFound);
  app.use(errorHandler);

  await new Promise((resolve) => server.listen(httpPort, resolve));
  logger.info(`Test server listening on http://127.0.0.1:${httpPort}`);
  logger.info(`MQTT available on ${process.env.MQTT_BROKER_URL || 'embedded 1883'}`);

  return { app, server, io, httpPort };
}

async function stopServer() {
  if (io) io.close();
  if (server) await new Promise((r) => server.close(r));
  const mongoose = require('mongoose');
  await mongoose.connection.close();
}

module.exports = { startServer, stopServer };