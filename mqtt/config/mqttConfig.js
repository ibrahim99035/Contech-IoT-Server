/**
 * MQTT Configuration and Topic Management
 */

const MQTT_CONFIG = {
  // Connection settings
  connection: {
    brokerUrl: process.env.MQTT_BROKER_URL || 'mqtt://localhost:1883',
    username: process.env.MQTT_USERNAME,
    password: process.env.MQTT_PASSWORD,
    clientIdPrefix: 'home-automation-server',
    options: {
      clean: true,
      reconnectPeriod: 5000,
      keepalive: 60,
      connectTimeout: 30000
    }
  },

  // QoS levels for different message types
  qos: {
    deviceState: 1,
    deviceStatus: 1,
    roomState: 1,
    espAuth: 1,
    espState: 1,
    taskNotification: 1
  },

  // Topic patterns
  topics: {
    // Device topics
    deviceState: 'home-automation/{deviceId}/state',
    deviceStatus: 'home-automation/{deviceId}/status',
    deviceTask: 'home-automation/{deviceId}/task',
    
    // Room topics
    roomState: 'home-automation/room/{roomId}/state',
    
    // ESP topics
    espAuth: 'home-automation/esp/{espId}/auth',
    espAuthResponse: 'home-automation/esp/{espId}/auth/response',
    espCompactState: 'home-automation/esp/{espId}/compact-state',
    espCompactStateResponse: 'home-automation/esp/{espId}/compact-state/response',
    espDisconnect: 'home-automation/esp/{espId}/disconnect',
    
    // ESP room-specific topics
    espRoomStateUpdate: 'home-automation/esp/room/{roomId}/state-update',
    espRoomBulkUpdate: 'home-automation/esp/room/{roomId}/bulk-update',
    espRoomTaskUpdate: 'home-automation/esp/room/{roomId}/task-update'
  },

  // Subscription patterns (with wildcards)
  subscriptions: [
    {
      pattern: 'home-automation/+/state',
      description: 'Device state updates',
      handler: 'deviceState'
    },
    {
      pattern: 'home-automation/+/status',
      description: 'Device connection status',
      handler: 'deviceStatus'
    },
    {
      pattern: 'home-automation/room/+/state',
      description: 'Room state updates',
      handler: 'roomState'
    },
    {
      pattern: 'home-automation/esp/+/compact-state',
      description: 'ESP compact state updates',
      handler: 'espCompactState'
    },
    {
      pattern: 'home-automation/esp/+/auth',
      description: 'ESP authentication requests',
      handler: 'espAuth'
    },
    {
      pattern: 'home-automation/esp/+/disconnect',
      description: 'ESP disconnect notifications',
      handler: 'espDisconnect'
    }
  ]
};

/**
 * Generate topic string by replacing placeholders
 * @param {String} topicTemplate - Topic template with placeholders
 * @param {Object} replacements - Object with replacement values
 * @returns {String} Generated topic string
 */
function generateTopic(topicTemplate, replacements = {}) {
  let topic = topicTemplate;
  
  for (const [key, value] of Object.entries(replacements)) {
    topic = topic.replace(new RegExp(`\\{${key}\\}`, 'g'), value);
  }
  
  return topic;
}

/**
 * Get MQTT connection options
 * @returns {Object} Connection options object
 */
function getConnectionOptions() {
  return {
    clientId: `${MQTT_CONFIG.connection.clientIdPrefix}-${Math.random().toString(16).substring(2, 10)}`,
    username: MQTT_CONFIG.connection.username,
    password: MQTT_CONFIG.connection.password,
    ...MQTT_CONFIG.connection.options
  };
}

/**
 * Get broker URL
 * @returns {String} MQTT broker URL
 */
function getBrokerUrl() {
  return MQTT_CONFIG.connection.brokerUrl;
}

/**
 * Get QoS level for specific message type
 * @param {String} messageType - Type of message
 * @returns {Number} QoS level (default: 1)
 */
function getQoS(messageType) {
  return MQTT_CONFIG.qos[messageType] || 1;
}

/**
 * Get all subscription patterns
 * @returns {Array} Array of subscription objects
 */
function getSubscriptions() {
  return MQTT_CONFIG.subscriptions;
}

/**
 * Validate topic format
 * @param {String} topic - Topic to validate
 * @returns {Object} Validation result
 */
function validateTopic(topic) {
  const validTopicRegex = /^[a-zA-Z0-9\-_\/\+#]+$/;
  
  if (!topic || typeof topic !== 'string') {
    return {
      valid: false,
      error: 'Topic must be a non-empty string'
    };
  }
  
  if (!validTopicRegex.test(topic)) {
    return {
      valid: false,
      error: 'Topic contains invalid characters'
    };
  }
  
  // Check for invalid wildcard usage
  if (topic.includes('#') && !topic.endsWith('#')) {
    return {
      valid: false,
      error: 'Multi-level wildcard (#) must be the last character'
    };
  }
  
  return { valid: true };
}

/**
 * Parse topic to extract parameters
 * @param {String} topic - Received topic
 * @param {String} pattern - Topic pattern to match against
 * @returns {Object|null} Extracted parameters or null if no match
 */
function parseTopicParameters(topic, pattern) {
  // Convert pattern to regex by replacing wildcards
  const regexPattern = pattern
    .replace(/\+/g, '([^/]+)')  // Single-level wildcard
    .replace(/#/g, '(.*)');     // Multi-level wildcard
  
  const regex = new RegExp(`^${regexPattern}$`);
  const match = topic.match(regex);
  
  if (!match) {
    return null;
  }
  
  // Extract parameter names from pattern
  const paramNames = [];
  const paramRegex = /\{([^}]+)\}/g;
  let paramMatch;
  
  while ((paramMatch = paramRegex.exec(pattern)) !== null) {
    paramNames.push(paramMatch[1]);
  }
  
  // Create parameters object
  const parameters = {};
  paramNames.forEach((name, index) => {
    if (match[index + 1] !== undefined) {
      parameters[name] = match[index + 1];
    }
  });
  
  return parameters;
}

module.exports = {
  MQTT_CONFIG,
  generateTopic,
  getConnectionOptions,
  getBrokerUrl,
  getQoS,
  getSubscriptions,
  validateTopic,
  parseTopicParameters
};