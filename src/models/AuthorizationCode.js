/**
 * models/AuthorizationCode.js
 * Authorization Code Model for OAuth2 flow
 */

const mongoose = require('mongoose');

const authorizationCodeSchema = new mongoose.Schema({
  code: {
    type: String,
    required: true,
    unique: true
  },
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  clientId: {
    type: String,
    required: true
  },
  redirectUri: {
    type: String,
    required: true
  },
  scope: {
    type: String,
    default: 'smart_home'
  },
  expiresAt: {
    type: Date,
    required: true,
    default: () => new Date(Date.now() + 10 * 60 * 1000) // 10 minutes
  }
}, {
  timestamps: true
});

// Auto-delete expired codes
authorizationCodeSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

module.exports = mongoose.model('AuthorizationCode', authorizationCodeSchema);