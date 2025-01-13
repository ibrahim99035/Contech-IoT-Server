const mongoose = require('mongoose');

const interactionSchema = new mongoose.Schema({
    user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    post: { type: mongoose.Schema.Types.ObjectId, ref: 'Post' },
    action: { type: String, enum: ['view', 'like', 'comment'], required: true },
    metadata: { type: Object }, // Additional data (e.g., time spent, device info)
}, { timestamps: true });
  
module.exports = mongoose.model('Interaction', interactionSchema);  