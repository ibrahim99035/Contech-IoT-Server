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
const morgan = require('morgan');
const cors = require('cors');
const helmet = require('helmet');
const http = require('http');
const socketIo = require('socket.io');

// ─── Internal modules ──────────────────────────────────────────────────────
const logger = require('./src/config/logger');
const connectDB = require('./src/config/db');

const { errorHandler } = require('./src/middleware/errorHandler');
const { notFound } = require('./src/middleware/notFound');

const TaskScheduler = require('./src/schedualr');

// Import Routes
const authRoutes = require('./src/routes/authRoutes');
const apartmentRoutes = require('./src/routes/apartmentRoutes');
const roomRoutes = require('./src/routes/roomRoutes');
const deviceRoutes = require('./src/routes/deviceRoutes');
const taskRoutes = require('./src/routes/taskRoutes');
const googleAssistantRoutes = require('./src/routes/googleAssistantRoutes');

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

// ─── Server Bootstrap ──────────────────────────────────────────────────────

async function startServer() {
  try {
    // Connect to database first (with retry logic)
    await connectDB();

    // Seed subscription system after DB connection
    await seedSubscriptionSystem();

    // Initialize Express app
    const app = express();

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

    // Start Task Scheduler after DB connection is established
    TaskScheduler.start();

    // ─── Global Middleware ───────────────────────────────────────────────

    // Security headers
    app.use(helmet({
      contentSecurityPolicy: false // Disable CSP for API-only server
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

    // HTTP request logging — Morgan piped through Winston
    const morganFormat = process.env.NODE_ENV === 'production' ? 'combined' : 'dev';
    app.use(morgan(morganFormat, { stream: logger.stream }));

    // ─── API Routes ─────────────────────────────────────────────────────
    app.use('/api/auth', authRoutes);
    app.use('/api/apartments-handler', apartmentRoutes);
    app.use('/api/rooms-handler', roomRoutes);
    app.use('/api/device-handler', deviceRoutes);
    app.use('/api/task-handler', taskRoutes);
    app.use('/api/images', imageRoutes); // to be removed later
    app.use('/api/google-assistant', googleAssistantRoutes);

    // ─── Admin Routes ───────────────────────────────────────────────────
    app.use('/admin/dashboard/apartments', apartmentAdminRoutes);
    app.use('/admin/dashboard/users', userAdminRoutes);
    app.use('/admin/dashboard/rooms', roomAdminRoutes);
    app.use('/admin/dashboard/devices', deviceAdminRoutes);
    app.use('/admin/dashboard/tasks', taskAdminRoutes);
    app.use('/admin/dashboard/subscription-limits', limitsRoutes);
    app.use('/admin/dashboard/background-imgs-set', imageRoutes);

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

process.on('unhandledRejection', (reason) => {
  const logger = require('./src/config/logger');
  logger.error('UNHANDLED REJECTION', { reason: reason?.message || reason });
  process.exit(1);
});

// Start the server
startServer();