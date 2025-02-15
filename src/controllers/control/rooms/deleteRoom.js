const Room = require('../../../models/Room');
const Apartment = require('../../../models/Apartment');
const Device = require('../../../models/Device');
const mongoose = require('mongoose');

exports.deleteRoom = async (req, res) => {
  const session = await mongoose.startSession();

  try {
    const roomId = req.params.id;
    if (!mongoose.Types.ObjectId.isValid(roomId)) {
      return res.status(400).json({ message: 'Invalid room ID' });
    }

    await session.withTransaction(async () => {
      const room = await Room.findById(roomId).session(session);
      if (!room) throw { status: 404, message: 'Room not found' };

      if (room.creator.toString() !== req.user._id.toString()) {
        throw { status: 403, message: 'Only the creator can delete the room' };
      }

      await Apartment.findByIdAndUpdate(room.apartment, { $pull: { rooms: roomId } }, { session });
      await Device.deleteMany({ room: roomId }, { session });
      await Room.findByIdAndDelete(roomId, { session });

      res.json({ message: 'Room deleted successfully' });
    });
  } catch (error) {
    session.endSession();
    res.status(error.status || 500).json({ message: error.message || 'Error deleting room' });
  }
};