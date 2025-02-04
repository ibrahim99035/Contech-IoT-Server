const Room = require('../../../models/Room');
const mongoose = require('mongoose');
const { invalidateCache } = require('../../../utils/cacheUtils');

exports.updateRoomName = async (req, res) => {
  try {
    const roomId = req.params.id;
    const { name } = req.body;

    if (!mongoose.Types.ObjectId.isValid(roomId))
      return res.status(400).json({ message: 'Invalid room ID' });

    const room = await Room.findById(roomId);
    if (!room) return res.status(404).json({ message: 'Room not found' });

    if (room.creator.toString() !== req.user._id.toString()) {
      return res.status(403).json({ message: 'Only the creator can update the room name' });
    }

    room.name = name;
    await room.save();

    invalidateCache(`rooms:${room.apartment}`);

    res.json({ message: 'Room name updated successfully', room });
  } catch (error) {
    res.status(500).json({ message: 'Error updating room name', error: error.message });
  }
};