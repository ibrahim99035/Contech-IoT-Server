# MQTT Module Documentation

This module provides a clean, modular approach to handling MQTT communications in the home automation system.

## File Structure

```
mqtt/
├── index.js                    # Main MQTT Manager
├── config/
│   └── mqttConfig.js          # Configuration and topic management
├── handlers/
│   ├── deviceHandler.js       # Device message handler
│   ├── roomHandler.js         # Room message handler
│   └── espHandler.js          # ESP device handler
├── publishers/
│   └── mqttPublisher.js       # MQTT publishing functions
├── utils/
│   └── espMappingManager.js   # ESP mapping utility
└── README.md                  # This file
```

## Components Overview

### Main MQTT Manager (`index.js`)

The central orchestrator that:
- Initializes MQTT connection
- Routes messages to appropriate handlers
- Manages subscriptions
- Provides public API

### Configuration (`config/mqttConfig.js`)

Centralized configuration for:
- Connection settings
- Topic patterns
- QoS levels
- Subscription management
- Topic validation utilities

### Message Handlers (`handlers/`)

#### Device Handler
- Processes device state changes
- Handles device status updates (online/offline)
- Notifies WebSocket clients
- Forwards updates to ESP devices

#### Room Handler
- Processes bulk room state updates
- Validates and updates multiple devices
- Notifies clients of room-wide changes

#### ESP Handler
- Manages ESP authentication
- Processes compact state messages
- Handles ESP disconnections
- Updates room connection status

### Publisher (`publishers/mqttPublisher.js`)

Centralized publishing functions for:
- Device state updates
- ESP notifications
- Task completions
- Authentication responses

### Utilities (`utils/espMappingManager.js`)

Manages ESP-to-room mappings:
- Authentication tracking
- Connection management
- Statistics and debugging

## Usage

### Basic Initialization

```javascript
const mqtt = require('./mqtt');
const io = require('./websockets/socketManager');

// Initialize MQTT with Socket.IO instance
mqtt.initialize(io);
```

### Publishing Messages

```javascript
// Publish device state change
mqtt.publishDeviceState('device-123', 'on', { 
  updatedBy: 'user' 
});

// Publish room state changes
mqtt.publishRoomState('room-456', [
  { deviceId: 'device-123', state: 'on' },
  { deviceId: 'device-124', state: 'off' }
]);
```

### ESP Management

```javascript
// Get ESP mapping info
const mapping = mqtt.getEspRoomMapping('esp-789');

// Remove ESP mapping (cleanup)
mqtt.removeEspRoomMapping('esp-789');
```

## Topic Structure

### Device Topics
- `home-automation/{deviceId}/state` - Device state updates
- `home-automation/{deviceId}/status` - Device connection status
- `home-automation/{deviceId}/task` - Task notifications

### Room Topics
- `home-automation/room/{roomId}/state` - Room state updates

### ESP Topics
- `home-automation/esp/{espId}/auth` - Authentication requests
- `home-automation/esp/{espId}/auth/response` - Authentication responses
- `home-automation/esp/{espId}/compact-state` - Compact state updates
- `home-automation/esp/{espId}/compact-state/response` - State responses
- `home-automation/esp/{espId}/disconnect` - Disconnect notifications

### ESP Room Topics
- `home-automation/esp/room/{roomId}/state-update` - Individual device updates
- `home-automation/esp/room/{roomId}/bulk-update` - Multiple device updates
- `home-automation/esp/room/{roomId}/task-update` - Task notifications

## Message Formats

### Device State Update
```json
{
  "state": "on",
  "timestamp": "2025-01-01T12:00:00Z",
  "updatedBy": "user"
}
```

### ESP Compact State
```
"21" // Device order 2, state on (1)
"30" // Device order 3, state off (0)
```

### ESP Authentication Request
```json
{
  "roomId": "room-123",
  "roomPassword": "optional-password"
}
```

### ESP Authentication Response
```json
{
  "success": true,
  "roomId": "room-123",
  "roomName": "Living Room",
  "availableDevices": [
    {
      "order": 1,
      "deviceId": "device-123",
      "deviceName": "Main Light",
      "currentState": "off"
    }
  ]
}
```

## Error Handling

Each handler includes comprehensive error handling:
- Invalid message format validation
- Database operation error handling
- MQTT connection error handling
- Graceful fallbacks for missing data

## Debugging

### ESP Mapping Statistics
```javascript
const espManager = new EspMappingManager();
const stats = espManager.getStats();
console.log('ESP Statistics:', stats);
```

### Topic Validation
```javascript
const { validateTopic } = require('./config/mqttConfig');
const result = validateTopic('home-automation/device-123/state');
console.log('Topic valid:', result.valid);
```

## Environment Variables

```env
MQTT_BROKER_URL=mqtt://localhost:1883
MQTT_USERNAME=your-username
MQTT_PASSWORD=your-password
```

## Production Considerations

1. **Redis Integration**: Replace in-memory ESP mappings with Redis for scalability
2. **Message Persistence**: Configure MQTT broker with persistence
3. **Health Monitoring**: Add health check endpoints
4. **Rate Limiting**: Implement rate limiting for ESP communications
5. **Security**: Use TLS and proper authentication in production

## Testing

Each module can be tested independently:
- Mock MQTT client for handler testing
- Unit tests for mapping manager
- Integration tests for full message flow

## Migration from Original Code

This refactored version maintains the same external API while improving:
- Code organization and maintainability
- Error handling and logging
- Testing capabilities
- Configuration management
- Debugging tools