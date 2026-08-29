/**
 * Environment Variable Validation
 * Validates all required environment variables at startup.
 * Must be called AFTER dotenv.config() and BEFORE any other module loads.
 * @module config/env
 */

const logger = require('./logger');

const REQUIRED_VARS = [
  'MONGODB_URI',
  'JWT_SECRET',
];

const RECOMMENDED_VARS = [
  { key: 'JWT_EXPIRES_IN', default: '30d', description: 'JWT token expiration' },
  { key: 'NODE_ENV', default: 'development', description: 'Runtime environment' },
  { key: 'PORT', default: '5000', description: 'Server port' },
];

const FEATURE_VARS = {
  email: ['EMAIL_USER', 'EMAIL_PASS'],
  cloudinary: ['CLOUDINARY_CLOUD_NAME', 'CLOUDINARY_API_KEY', 'CLOUDINARY_API_SECRET'],
  googleAuth: ['GOOGLE_CLIENT_ID'],
  googleAssistant: ['GOOGLE_ACTIONS_CLIENT_ID', 'GOOGLE_ACTIONS_CLIENT_SECRET'],
  mqtt: ['MQTT_BROKER_URL'],
};

function validateEnv() {
  const errors = [];
  const warnings = [];

  // Check required variables
  for (const key of REQUIRED_VARS) {
    if (!process.env[key]) {
      errors.push(`Missing required environment variable: ${key}`);
    }
  }

  // Set defaults for recommended variables
  for (const { key, default: defaultVal, description } of RECOMMENDED_VARS) {
    if (!process.env[key]) {
      process.env[key] = defaultVal;
      warnings.push(`${key} not set, defaulting to "${defaultVal}" (${description})`);
    }
  }

  // Check feature-specific variables
  for (const [feature, keys] of Object.entries(FEATURE_VARS)) {
    const missing = keys.filter(key => !process.env[key]);
    if (missing.length > 0 && missing.length < keys.length) {
      // Partially configured — likely a bug
      warnings.push(`Feature "${feature}" is partially configured. Missing: ${missing.join(', ')}`);
    } else if (missing.length === keys.length) {
      warnings.push(`Feature "${feature}" is disabled (missing: ${missing.join(', ')})`);
    }
  }

  // Output warnings
  if (warnings.length > 0) {
    logger.warn('Environment warnings:\n' + warnings.map(w => `  - ${w}`).join('\n'));
  }

  // Fail on errors
  if (errors.length > 0) {
    logger.error('FATAL: Environment validation failed:\n' + errors.map(e => `  - ${e}`).join('\n'));
    logger.error('Server cannot start without these variables.');
    process.exit(1);
  }
}

module.exports = validateEnv;
