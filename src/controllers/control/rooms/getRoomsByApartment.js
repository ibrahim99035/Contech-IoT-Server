const Room = require('../../../models/Room');
const Apartment = require('../../../models/Apartment');
const mongoose = require('mongoose');

exports.getRoomsByApartment = async (req, res) => {
  try {
    const { apartmentId } = req.params;

    if (!mongoose.Types.ObjectId.isValid(apartmentId)) {
      return res.status(400).json({ message: 'Invalid apartment ID' });
    }

    const apartmentExists = await Apartment.exists({ _id: apartmentId, members: req.user._id });
    if (!apartmentExists) {
      return res.status(403).json({ message: 'Access denied. You are not a member of this apartment or it does not exist.' });
    }

    const rooms = await Room.find({
      apartment: apartmentId,
      users: req.user._id, // Filters only rooms where the user is a member
    })
      .populate('devices', 'name type status')
      .populate('users', '_id name email')
      .lean();

    if (!rooms.length) {
      return res.status(404).json({ message: 'No rooms found for this apartment.' });
    }

    res.json(rooms);
  } catch (error) {
    res.status(500).json({ message: 'Error fetching rooms', error: error.message });
  }
};