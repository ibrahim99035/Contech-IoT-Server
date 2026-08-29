/**
 * MQTT topic constants, subscription list, and topic-pattern matchers.
 * Centralizes all topic strings so handlers and the router stay in sync.
 * @module mqtt/topics
 */

// Inbound topics the server subscribes to
const SUBSCRIPTIONS = [
  { topic: 'home-automation/+/state', description: 'device state topics' },
  { topic: 'home-automation/+/status', description: 'device status topics' },
  { topic: 'home-automation/room/+/state', description: 'room state topics' },
  { topic: 'home-automation/esp/+/compact-state', description: 'ESP compact state topics' },
  { topic: 'home-automation/esp/+/auth', description: 'ESP auth topics' },
  { topic: 'home-automation/esp/+/disconnect', description: 'ESP disconnect topics' }
];

// Outbound topic builders
const topics = {
  espAuthResponse: (espId) => `home-automation/esp/${espId}/auth/response`,
  espCompactResponse: (espId) => `home-automation/esp/${espId}/compact-state/response`,
  espRoomStateUpdate: (roomId) => `home-automation/esp/room/${roomId}/state-update`,
  espRoomBulkUpdate: (roomId) => `home-automation/esp/room/${roomId}/bulk-update`,
  espRoomTaskUpdate: (roomId) => `home-automation/esp/room/${roomId}/task-update`,
  deviceState: (deviceId) => `home-automation/${deviceId}/state`,
  deviceTask: (deviceId) => `home-automation/${deviceId}/task`,
  roomState: (roomId) => `home-automation/room/${roomId}/state`
};

const ROUTE_PATTERNS = {
  'device-state': /^home-automation\/([^/]+)\/state$/,
  'device-status': /^home-automation\/([^/]+)\/status$/,
  'room-state': /^home-automation\/room\/([^/]+)\/state$/,
  'esp-compact-state': /^home-automation\/esp\/([^/]+)\/compact-state$/,
  'esp-auth': /^home-automation\/esp\/([^/]+)\/auth$/,
  'esp-disconnect': /^home-automation\/esp\/([^/]+)\/disconnect$/
};

/**
 * Match an inbound topic against the known routes.
 * @param {string} topic
 * @returns {{ type: string, id: string } | null} route + captured id, or null
 */
function matchTopic(topic) {
  for (const [type, pattern] of Object.entries(ROUTE_PATTERNS)) {
    const match = topic.match(pattern);
    if (match) {
      return { type, id: match[1] };
    }
  }
  return null;
}

module.exports = { SUBSCRIPTIONS, topics, matchTopic };