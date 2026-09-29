#!/usr/bin/env node
/**
 * Quick Server Start for Contech IoT
 * Run this to start the server with proper MongoDB connection
 * Connects to production MongoDB replica set via SSH tunnel
 */

const { spawn } = require('child_process');
const path = require('path');
const dotenv = require('dotenv');

dotenv.config();

console.log('========================================');
console.log('Starting Contech IoT Server');
console.log('========================================');
console.log('');
console.log('Production Services (via SSH tunnel):');
console.log('  MongoDB: 127.0.0.1:27017 (replica set)');
console.log('  Redis:   127.0.0.1:6380');
console.log('  MQTT:    127.0.0.1:1884');
console.log('');

// Change to project directory
process.chdir('/media/ibrahim/New Volume/Projects/Contech-IoT-Server');

// Get the dynamic port for SSH tunnel
const PORT = process.env.PORT || '5000';

// Fail fast on missing configuration rather than letting server.js boot with
// undefined credentials and fail later at the database or broker.
const REQUIRED = ['MONGODB_URI', 'REDIS_PASSWORD', 'JWT_SECRET'];
const missing = REQUIRED.filter((key) => !process.env[key]);

if (missing.length) {
  console.error('Missing required configuration: ' + missing.join(', '));
  console.error('');
  console.error('These are read from .env (gitignored) via dotenv. Create or fix it:');
  console.error('  cp .env.example .env');
  console.error('then set: ' + missing.join(', '));
  process.exit(1);
}

// Start server process with explicit environment
const server = spawn('node', ['server.js'], {
  env: {
    ...process.env,
    PORT,
    NODE_ENV: 'development',
    // Non-secret local-dev preferences only.
    //
    // Credentials are NOT set here. They used to be hardcoded in this file,
    // which committed the production MongoDB, Redis, MQTT and JWT secrets to
    // source. server.js loads them from .env (gitignored) via dotenv, so the
    // overrides were pure duplication and pure risk: rotating a secret in .env
    // silently did nothing while this file kept handing the old value to the
    // child process. Keep secrets in .env and rotate them there.
    LOG_LEVEL: 'debug',
    LOG_TO_CONSOLE: 'true',
    // Frontend (local dev)
    FRONTEND_URL_TOKEN: 'http://localhost:3000/api/auth',
    FRONTEND_URL: 'http://localhost:3000'
  },
  stdio: 'inherit',
  detached: false
});

server.on('error', (err) => {
  console.error('Failed to start server:', err.message);
  process.exit(1);
});

server.on('close', (code) => {
  console.log(`\nServer exited with code ${code}`);
  if (code !== 0) {
    console.log('Check logs for errors. Common issues:');
    console.log('  • SSH tunnels not running (run: ./setup_tunnels.sh)');
    console.log('  • MongoDB replica set issues');
    console.log('  • Port conflicts');
  }
  process.exit(code || 0);
});

console.log(`Server will start on port ${PORT}...`);
console.log('');
console.log('Waiting for MongoDB connection...');
console.log('');

// Keep process alive
process.on('SIGINT', () => {
  console.log('\nShutting down...');
  server.kill('SIGTERM');
  process.exit(0);
});

process.on('uncaughtException', (err) => {
  console.error('Uncaught exception:', err.message);
});
