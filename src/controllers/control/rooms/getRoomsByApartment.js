const Room = require('../../../models/Room');
const Apartment = require('../../../models/Apartment');
const mongoose = require('mongoose');

exports.getRoomsByApartment = async (req, res) => {
  const { apartmentId } = req.params;

  try {
    if (!mongoose.Types.ObjectId.isValid(apartmentId)) {
      return res.status(400).json({ message: 'Invalid apartment ID' });
    }

    const apartment = await Apartment.findById(apartmentId).populate('members', '_id');
    if (!apartment) {
      return res.status(404).json({ message: 'Apartment not found' });
    }

    if (!apartment.members.some(member => member._id.toString() === req.user._id.toString())) {
      return res.status(403).json({ message: 'Access denied. You are not a member of this apartment.' });
    }

    const rooms = await Room.find({ apartment: apartmentId })
      .populate('devices', 'name type status')
      .populate('users', '_id name email')
      .lean();

    const filteredRooms = rooms.filter(room =>
      room.users.some(user => user._id.toString() === req.user._id.toString())
    );

    if (filteredRooms.length === 0) {
      return res.status(404).json({ message: 'No rooms found for this apartment.' });
    }

    res.json(filteredRooms);
  } catch (error) {
    res.status(500).json({ message: 'Error fetching rooms', error: error.message });
  }
};