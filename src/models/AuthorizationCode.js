/**
 * models/AuthorizationCode.js
 * Model for storing OAuth2 authorization codes
 */

const mongoose = require('mongoose');

const authorizationCodeSchema = new mongoose.Schema({
  code: {
    type: String,
    required: true,
    unique: true,
    index: true
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
    default: () => new Date(Date.now() + 10 * 60 * 1000), // 10 minutes from now
    index: { expires: 0 } // MongoDB TTL index - automatically removes expired documents
  }
}, { 
  timestamps: true 
});

// Index for efficient cleanup and querying
authorizationCodeSchema.index({ code: 1, clientId: 1 });
authorizationCodeSchema.index({ userId: 1 });

module.exports = mongoose.model('AuthorizationCode', authorizationCodeSchema);