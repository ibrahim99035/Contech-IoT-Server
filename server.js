/**
 * Contech IoT Server — Entry Point
 * Production-grade Express + Socket.io + MQTT server for smart home automation.
 */

'use strict';

// ─── Load environment variables ONCE (before anything else) ─────────────────
const dotenv = require('dotenv');
dotenv.config();

// ─── Validate environment ───────────────────────────────────────────────────
const validateEnv = require('./src/config/env');
validateEnv();

// ─── Core dependencies ─────────────────────────────────────────────────────
const express = require('express');
const crypto = require('crypto');
const cors = require('cors');
const helmet = require('helmet');
const http = require('http');
const socketIo = require('socket.io');

// ─── Internal modules ──────────────────────────────────────────────────────
const logger = require('./src/config/logger');
const connectDB = require('./src/config/db');

const { errorHandler } = require('./src/middleware/errorHandler');
const { notFound } = require('./src/middleware/notFound');
const requestLogger = require('./src/middleware/requestLogger');

const TaskScheduler = require('./src/schedualr');

// Import Routes
const authRoutes = require('./src/routes/authRoutes');
const apartmentRoutes = require('./src/routes/apartmentRoutes');
const roomRoutes = require('./src/routes/roomRoutes');
const deviceRoutes = require('./src/routes/deviceRoutes');
const taskRoutes = require('./src/routes/taskRoutes');
const googleAssistantRoutes = require('./src/routes/googleAssistantRoutes');
const subscriptionRoutes = require('./src/routes/subscriptionRoutes');

// Admin Routes
const apartmentAdminRoutes = require('./src/adminRoutes/apartmentAdminRoutes');
const userAdminRoutes = require('./src/adminRoutes/userAdminRoutes');
const deviceAdminRoutes = require('./src/adminRoutes/deviceAdminRoutes');
const roomAdminRoutes = require('./src/adminRoutes/roomAdminRoutes');
const taskAdminRoutes = require('./src/adminRoutes/taskAdminRoutes');
const limitsRoutes = require('./src/adminRoutes/LimitsRoutes');
const imageRoutes = require('./src/adminRoutes/imageRoutes');

// Subscription System Seeder
const seedSubscriptionSystem = require('./src/scripts/seedSubscriptionLimits');

// Swagger Documentation & AdminJS Setup
const setupSwagger = require('./src/config/swagger');
const setupAdminJS = require('./src/config/adminjs');

// ─── Server Bootstrap ──────────────────────────────────────────────────────

async function startServer() {
  try {
    // Connect to database first (with retry logic)
    await connectDB();

    // Seed subscription system after DB connection
    await seedSubscriptionSystem();

    // Initialize Express app
    const app = express();

    // NOTE: the AdminJS dashboard is mounted LATER (see "Admin Routes" below),
    // after the /admin/dashboard/* REST routers and after express.json().
    // AdminJS's buildAuthenticatedRouter is a catch-all for every path under
    // /admin, so mounting it first would 302-redirect all dashboard API calls to
    // /admin/login and they would never reach their controllers.

    // Create HTTP server
    const server = http.createServer(app);

    // ─── Trust proxy (required behind Nginx) ────────────────────────────
    app.set('trust proxy', 1);

    // ─── CORS Configuration ─────────────────────────────────────────────
    const allowedOrigins = process.env.ALLOWED_ORIGINS
      ? process.env.ALLOWED_ORIGINS.split(',').map(o => o.trim())
      : ['*'];

    const corsOptions = {
      origin: allowedOrigins.includes('*') ? '*' : allowedOrigins,
      methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH'],
      allowedHeaders: ['Content-Type', 'Authorization'],
      credentials: !allowedOrigins.includes('*'),
      maxAge: 86400 // 24 hours
    };

    // ─── Initialize Socket.io ───────────────────────────────────────────
    const io = socketIo(server, {
      cors: corsOptions,
      pingTimeout: 60000,
      pingInterval: 25000
    });

    // Make io accessible to route handlers
    app.set('io', io);

    // WebSocket logic for user and IoT device
    require('./src/websockets')(io);

    // Start Task Scheduler after DB connection is established.
    // Safety gate: REDIS_URL points at the PRODUCTION Redis, so a local run would
    // start BullMQ workers that can fire real scheduled tasks at real devices.
    // Opt out with SCHEDULER_ENABLED=false.
    if (String(process.env.SCHEDULER_ENABLED ?? 'true').toLowerCase() === 'false') {
      logger.warn('Task Scheduler is disabled (SCHEDULER_ENABLED=false); skipping BullMQ workers');
    } else {
      TaskScheduler.start();
    }

    // ─── Global Middleware ───────────────────────────────────────────────

    // Security headers
    app.use(helmet({
      contentSecurityPolicy: false // Disable CSP for API-only server & AdminJS
    }));

    // Request ID for tracing
    app.use((req, res, next) => {
      req.id = req.headers['x-request-id'] || crypto.randomUUID();
      res.setHeader('X-Request-Id', req.id);
      next();
    });

    // JSON body parsing
    app.use(express.json({ limit: '5mb' }));

    // CORS
    app.use(cors(corsOptions));

    // Request logging (structured, request-id aware)
    app.use(requestLogger);

    // ─── Swagger API Documentation ──────────────────────────────────────
    setupSwagger(app);
    logger.info('Swagger API Documentation mounted at /api-docs');

    // ─── API Routes ─────────────────────────────────────────────────────
    app.use('/api/auth', authRoutes);
    app.use('/api/apartments-handler', apartmentRoutes);
    app.use('/api/rooms-handler', roomRoutes);
    app.use('/api/device-handler', deviceRoutes);
    app.use('/api/task-handler', taskRoutes);
    app.use('/api/images', imageRoutes); // to be removed later
    app.use('/api/google-assistant', googleAssistantRoutes);
    app.use('/api/subscription', subscriptionRoutes);

    // ─── Admin Routes ───────────────────────────────────────────────────
    // Mounted BEFORE AdminJS on purpose: these specific /admin/dashboard/* paths
    // must win over AdminJS's catch-all /admin router.
    app.use('/admin/dashboard/apartments', apartmentAdminRoutes);
    app.use('/admin/dashboard/users', userAdminRoutes);
    app.use('/admin/dashboard/rooms', roomAdminRoutes);
    app.use('/admin/dashboard/devices', deviceAdminRoutes);
    app.use('/admin/dashboard/tasks', taskAdminRoutes);
    app.use('/admin/dashboard/subscription-limits', limitsRoutes);
    app.use('/admin/dashboard/background-imgs-set', imageRoutes);

    // Setup AdminJS Dashboard (catch-all for the rest of /admin)
    try {
      const { adminJs, router: adminRouter } = await setupAdminJS();
      app.use(adminJs.options.rootPath, adminRouter);
      logger.info(`AdminJS Dashboard mounted at ${adminJs.options.rootPath}`);
    } catch (adminErr) {
      logger.error('Failed to mount AdminJS Dashboard', { error: adminErr.message });
    }

    // ─── Health Check ───────────────────────────────────────────────────
    app.get('/health', (req, res) => {
      res.status(200).json({
        status: 'OK',
        timestamp: new Date().toISOString(),
        uptime: process.uptime(),
        version: process.env.npm_package_version || '1.0.0',
        environment: process.env.NODE_ENV
      });
    });

    // ─── Error Handling ─────────────────────────────────────────────────
    app.use(notFound);
    app.use(errorHandler);

    // ─── Start Listening ────────────────────────────────────────────────
    const PORT = process.env.PORT || 5000;
    server.listen(PORT, () => {
      logger.info(`Server running in ${process.env.NODE_ENV} mode on port ${PORT}`);
    });

    // ─── Graceful Shutdown ──────────────────────────────────────────────
    const gracefulShutdown = async (signal) => {
      logger.info(`${signal} received. Starting graceful shutdown...`);

      server.close(async () => {
        logger.info('HTTP server closed');

        try {
          const mongoose = require('mongoose');
          await mongoose.connection.close();
          logger.info('MongoDB connection closed');
        } catch (err) {
          logger.error('Error closing MongoDB connection', { error: err.message });
        }

        process.exit(0);
      });

      // Force exit after 10 seconds
      setTimeout(() => {
        logger.error('Graceful shutdown timed out. Forcing exit.');
        process.exit(1);
      }, 10000);
    };

    process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
    process.on('SIGINT', () => gracefulShutdown('SIGINT'));

  } catch (error) {
    logger.error('Failed to start server', { error: error.message, stack: error.stack });
    process.exit(1);
  }
}

// ─── Uncaught Exception / Rejection Handlers ────────────────────────────────

process.on('uncaughtException', (err) => {
  const logger = require('./src/config/logger');
  logger.error('UNCAUGHT EXCEPTION', { error: err.message, stack: err.stack });
  process.exit(1);
});

// A single unhandled rejection must not take the whole IoT gateway offline:
// the rejection is almost always scoped to one in-flight request, while
// process.exit(1) drops every device connection and pending API call with it.
// Log loudly (with stack) and keep serving so the fault is diagnosable and
// isolated. Genuinely fatal states still exit via 'uncaughtException' above.
process.on('unhandledRejection', (reason) => {
  const logger = require('./src/config/logger');
  logger.error('UNHANDLED REJECTION', {
    reason: reason?.message || reason,
    stack: reason?.stack,
    fatal: false
  });
});

// Start the server
startServer();