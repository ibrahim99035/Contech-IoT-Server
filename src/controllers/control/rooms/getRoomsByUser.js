const Room = require('../../../models/Room');

exports.getRoomsByUser = async (req, res) => {
  try {
    const rooms = await Room.find({ users: req.user._id })
      .populate('apartment', 'name')
      .populate('devices', 'name type status')
      .lean();

    res.json(rooms);
  } catch (error) {
    res.status(500).json({ message: 'Error fetching rooms', error: error.message });
  }
};