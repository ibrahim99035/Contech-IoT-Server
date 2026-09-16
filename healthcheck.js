#!/usr/bin/env node
/**
 * Container healthcheck for the Contech IoT Server.
 *
 * Referenced by the Dockerfile HEALTHCHECK instruction:
 *   CMD node healthcheck.js || exit 1
 *
 * Exits 0 when the HTTP server answers GET /health with 200, otherwise exits 1.
 * Uses only Node built-ins so it works in the production image (no curl/wget).
 *
 * NOTE: docker-compose.yml overrides this with an equivalent wget-based test,
 * so this script primarily serves `docker run` without compose.
 */

'use strict';

const http = require('http');

const PORT = process.env.PORT || 5000;
const PATH = process.env.HEALTHCHECK_PATH || '/health';
const TIMEOUT_MS = Number(process.env.HEALTHCHECK_TIMEOUT_MS || 5000);

const req = http.get(
  { host: '127.0.0.1', port: PORT, path: PATH, timeout: TIMEOUT_MS },
  (res) => {
    // Drain the response so the socket can close cleanly.
    res.resume();
    res.on('end', () => process.exit(res.statusCode === 200 ? 0 : 1));
  }
);

req.on('timeout', () => {
  req.destroy();
  process.exit(1);
});

req.on('error', () => {
  process.exit(1);
});
