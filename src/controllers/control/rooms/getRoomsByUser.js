const Room = require('../../../models/Room');

exports.getRoomsByUser = async (req, res) => {
  try {
    const rooms = await Room.find({ users: req.user._id })
      .populate('apartment', 'name')
      .populate('devices', 'name type status')
      .select('_id name apartment devices') // Fetch only needed fields
      .lean();

    if (!rooms.length) {
      return res.status(404).json({ message: 'No rooms found for this user.' });
    }

    res.json(rooms);
  } catch (error) {
    res.status(500).json({ message: 'Error fetching rooms', error: error.message });
  }
};