const Room = require('../../../models/Room');
const mongoose = require('mongoose');

exports.addUsersToRoom = async (req, res) => {
  try {
    const roomId = req.params.id;
    const { userIds } = req.body;

    if (!mongoose.Types.ObjectId.isValid(roomId))
      return res.status(400).json({ message: 'Invalid room ID' });

    const room = await Room.findById(roomId);
    if (!room) return res.status(404).json({ message: 'Room not found' });

    if (room.creator.toString() !== req.user._id.toString()) {
      return res.status(403).json({ message: 'Only the creator can add users' });
    }

    room.users.push(...userIds);
    await room.save();

    res.json({ message: 'Users added to room successfully', room });
  } catch (error) {
    res.status(500).json({ message: 'Error adding users to room', error: error.message });
  }
};