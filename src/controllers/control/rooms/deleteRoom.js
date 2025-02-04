const Room = require('../../../models/Room');
const Apartment = require('../../../models/Apartment');
const Device = require('../../../models/Device');
const mongoose = require('mongoose');
const { invalidateCache } = require('../../../utils/cacheUtils');

exports.deleteRoom = async (req, res) => {
  const session = await mongoose.startSession();
  try {
    session.startTransaction();

    const roomId = req.params.id;

    if (!mongoose.Types.ObjectId.isValid(roomId))
      return res.status(400).json({ message: 'Invalid room ID' });

    const room = await Room.findById(roomId);
    if (!room) throw new Error('Room not found');

    if (room.creator.toString() !== req.user._id.toString()) {
      return res.status(403).json({ message: 'Only the creator can delete the room' });
    }

    await Apartment.findByIdAndUpdate(room.apartment, { $pull: { rooms: roomId } }, { session });
    await Device.deleteMany({ room: roomId }, { session });
    await Room.findByIdAndDelete(roomId, { session });

    await session.commitTransaction();
    session.endSession();

    invalidateCache(`rooms:${room.apartment}`);

    res.json({ message: 'Room deleted successfully' });
  } catch (error) {
    await session.abortTransaction();
    session.endSession();
    res.status(500).json({ message: 'Error deleting room', error: error.message });
  }
};