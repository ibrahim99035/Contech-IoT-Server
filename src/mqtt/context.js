/**
 * Shared MQTT runtime context.
 * Holds the live client, the Socket.io instance, and the ESP↔room mapping state.
 * All MQTT modules read/write this single source of truth so there is no
 * hidden module-scope state and no circular dependency between modules.
 * @module mqtt/context
 */

const espRoomMappings = new Map();
const roomEspConnections = new Map();

const context = {
  client: null,
  io: null,
  espRoomMappings,
  roomEspConnections
};

module.exports = { context, espRoomMappings, roomEspConnections };