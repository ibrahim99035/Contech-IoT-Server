const mongoose = require('mongoose');

const apartmentSchema = new mongoose.Schema({
    name: { type: String, required: true },
    creator: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true }, // Creator of the apartment
    members: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }], // Other users with access
    rooms: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Room' }], // Rooms in the apartment
}, { timestamps: true });
  
module.exports = mongoose.model('Apartment', apartmentSchema);  