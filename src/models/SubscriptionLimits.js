const mongoose = require('mongoose');

const subscriptionLimitsSchema = new mongoose.Schema({
  planName: { 
    type: String, 
    required: true, 
    unique: true, 
    enum: ['free', 'gold', 'platinum'],
    lowercase: true
  },
  limits: {
    apartments: {
      owned: { type: Number, required: true, min: 0 },
      memberships: { type: Number, required: true, min: 0 }
    },
    rooms: {
      perApartment: { type: Number, required: true, min: 0 }
    },
    devices: {
      perRoom: { type: Number, required: true, min: 0 }
    },
    tasks: {
      perDevice: { type: Number, required: true, min: 0 },
      totalPerUser: { type: Number, required: true, min: 0 }
    }
  },
  isActive: { type: Boolean, default: true },
  description: { type: String },
  lastUpdated: { type: Date, default: Date.now }
}, { timestamps: true });

module.exports = mongoose.model('SubscriptionLimits', subscriptionLimitsSchema);