#!/usr/bin/env node
/**
 * Quick Server Start for Contech IoT
 * Run this to start the server with proper MongoDB connection
 * Connects to production MongoDB replica set via SSH tunnel
 */

const { spawn } = require('child_process');
const path = require('path');

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

// Start server process with explicit environment
const server = spawn('node', ['server.js'], {
  env: {
    ...process.env,
    PORT,
    NODE_ENV: 'development',
    // MongoDB - direct connection to production replica-set primary
    // (verified working; SSH tunnel hits a secondary and cannot seed/write)
    MONGODB_URI: 'mongodb://admin:ConTech_MongoDB_2024!Secure@88.222.220.235:27017/contech?authSource=admin&directConnection=true&loadBalanced=false&retryWrites=false',
    // Redis
    REDIS_HOST: '88.222.220.235',
    REDIS_PORT: '6380',
    REDIS_PASSWORD: 'redispass123',
    REDIS_URL: 'redis://:redispass123@88.222.220.235:6380',
    // MQTT
    MQTT_BROKER_URL: 'mqtt://88.222.220.235:1884',
    MQTT_USERNAME: 'contech',
    MQTT_PASSWORD: '@#/123Work@#/',
    // Auth
    JWT_SECRET: 'dsasdfghjklk689743hjdsgwtt87438745slfklgji5814871506h5714984j585hjfb5y5y6dg7573jjg64gsdglkfdsjhtgh78486djkjkjjru6n89089587958m',
    JWT_EXPIRES_IN: '6d',
    // Logging
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
