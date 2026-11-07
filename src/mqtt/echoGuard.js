/**
 * Short-lived guard for server-originated MQTT echoes.
 *
 * Direct socket paths (user update, room-user update, device report, room-ESP
 * report) already update MongoDB and fan out Socket.IO updates before they
 * publish to MQTT. The server also subscribes to the same device/room topics, so
 * without a guard it processes its own publish a second time and emits duplicate
 * events / ESP commands.
 *
 * `createEchoId()` tags a publish as already applied. The inbound MQTT handler
 * consumes the tag and ignores that message (including broker-level QoS 1
 * redeliveries) for the guard's short lifetime. An ID is only trusted for a
 * short window, so it cannot suppress later legitimate device reports.
 *
 * This is an internal dedupe marker, not an authentication boundary. The broker
 * is already the trust boundary for who may publish device/room state.
 *
 * @module mqtt/echoGuard
 */

const crypto = require('crypto');

const ECHO_TTL_MS = 5 * 60 * 1000;
const recent = new Map();

function cleanup(now = Date.now()) {
  const cutoff = now - ECHO_TTL_MS;
  for (const [id, ts] of recent) {
    if (ts < cutoff) recent.delete(id);
  }
}

/**
 * Create and remember a one-use echo id.
 * @returns {string}
 */
function createEchoId() {
  const now = Date.now();
  const id = crypto.randomUUID();
  recent.set(id, now);
  cleanup(now);
  return id;
}

/**
 * Consume an echo id from an inbound payload.
 * @param {object} payload
 * @returns {boolean} true when this message is the server's own publish
 */
function isOwnEcho(payload) {
  if (!payload || typeof payload.echoId !== 'string') return false;
  return recent.has(payload.echoId);
}

/**
 * Clear the guard (tests / shutdown).
 */
function reset() {
  recent.clear();
}

module.exports = { createEchoId, isOwnEcho, reset, ECHO_TTL_MS };
