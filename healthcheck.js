/**
 * Docker Health Check Script
 * Used by Dockerfile HEALTHCHECK instruction.
 * Makes an HTTP request to /health and exits with appropriate code.
 */

'use strict';

const http = require('http');

const options = {
  host: 'localhost',
  port: process.env.PORT || 5000,
  path: '/health',
  timeout: 5000
};

const request = http.get(options, (res) => {
  process.exit(res.statusCode === 200 ? 0 : 1);
});

request.on('error', () => {
  process.exit(1);
});

request.on('timeout', () => {
  request.destroy();
  process.exit(1);
});
