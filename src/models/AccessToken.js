/**
 * models/AccessToken.js
 * Model for storing OAuth2 access tokens
 */

const mongoose = require('mongoose');

const accessTokenSchema = new mongoose.Schema({
  token: {
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
  scope: {
    type: String,
    default: 'smart_home'
  },
  refreshToken: {
    type: String,
    required: true,
    unique: true,
    index: true
  },
  expiresAt: {
    type: Date,
    required: true,
    default: () => new Date(Date.now() + 3600 * 1000), // 1 hour from now
    index: { expires: 0 } // MongoDB TTL index - automatically removes expired documents
  },
  isRevoked: {
    type: Boolean,
    default: false
  }
}, { 
  timestamps: true 
});

// Compound indexes for efficient querying
accessTokenSchema.index({ token: 1, clientId: 1 });
accessTokenSchema.index({ userId: 1, clientId: 1 });
accessTokenSchema.index({ refreshToken: 1 });

module.exports = mongoose.model('AccessToken', accessTokenSchema);