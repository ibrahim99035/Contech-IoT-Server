const Device = require('../../../models/Device');
const Room = require('../../../models/Room');
const mongoose = require('mongoose');

exports.getDevicesByRoom = async (req, res) => {
  try {
    const { roomId } = req.query;

    if (!mongoose.Types.ObjectId.isValid(roomId)) {
      return res.status(400).json({ message: 'Invalid room ID' });
    }

    const room = await Room.findById(roomId);
    if (!room) {
      return res.status(404).json({ message: 'Room not found' });
    }

    if (!room.users.includes(req.user._id.toString()) && room.creator.toString() !== req.user._id.toString()) {
      return res.status(403).json({ message: 'Access denied.' });
    }

    const devices = await Device.find({ room: roomId }).populate('users', 'name email').lean();

    res.json(devices);
  } catch (error) {
    res.status(500).json({ message: 'Error fetching devices', error: error.message });
  }
};