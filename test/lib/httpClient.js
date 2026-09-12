/**
 * Minimal HTTP client for tests (no external deps; mirrors test_all_endpoints).
 */

'use strict';

const http = require('http');

function request(basePort, method, path, body = null, token = null, extraHeaders = {}) {
  return new Promise((resolve, reject) => {
    const data = body ? JSON.stringify(body) : '';
    const headers = {
      'Content-Type': 'application/json',
      'Content-Length': Buffer.byteLength(data),
      ...extraHeaders
    };
    if (token) headers.Authorization = `Bearer ${token}`;
    headers.Connection = 'close'; // avoid keep-alive sockets blocking server.close() in tests

    const req = http.request(
      { hostname: '127.0.0.1', port: basePort, path, method, headers },
      (res) => {
        let responseBody = '';
        res.on('data', (c) => (responseBody += c));
        res.on('end', () => {
          let json = null;
          try { json = JSON.parse(responseBody); } catch { json = responseBody; }
          resolve({ statusCode: res.statusCode, body: json });
        });
      }
    );
    req.on('error', reject);
    if (data) req.write(data);
    req.end();
  });
}

module.exports = { request };