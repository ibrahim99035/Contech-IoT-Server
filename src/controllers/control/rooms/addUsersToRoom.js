const Room = require('../../../models/Room');
const mongoose = require('mongoose');

exports.addUsersToRoom = async (req, res) => {
  try {
    const roomId = req.params.id;
    let { userIds } = req.body;

    if (!mongoose.Types.ObjectId.isValid(roomId)) {
      return res.status(400).json({ message: 'Invalid room ID' });
    }

    if (!Array.isArray(userIds) || userIds.length === 0) {
      return res.status(400).json({ message: 'userIds must be a non-empty array' });
    }

    // Validate each userId
    userIds = userIds.filter((id) => mongoose.Types.ObjectId.isValid(id));

    const room = await Room.findById(roomId);
    if (!room) {
      return res.status(404).json({ message: 'Room not found' });
    }

    if (room.creator.toString() !== req.user._id.toString()) {
      return res.status(403).json({ message: 'Only the creator can add users' });
    }

    // Remove creator from the list (if included)
    userIds = userIds.filter((id) => id !== req.user._id.toString());

    // Add only unique users
    room.users = [...new Set([...room.users.map(String), ...userIds])];

    await room.save();

    res.json({ message: 'Users added to room successfully', room });
  } catch (error) {
    res.status(500).json({ message: 'Error adding users to room', error: error.message });
  }
};