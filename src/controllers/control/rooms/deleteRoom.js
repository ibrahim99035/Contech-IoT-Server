const Room = require('../../../models/Room');
const Apartment = require('../../../models/Apartment');
const Device = require('../../../models/Device');
const mongoose = require('mongoose');

exports.deleteRoom = async (req, res) => {
  const roomId = req.params.id;
  if (!mongoose.Types.ObjectId.isValid(roomId)) {
    return res.status(400).json({ message: 'Invalid room ID' });
  }

  const room = await Room.findById(roomId);
  if (!room) {
    return res.status(404).json({ message: 'Room not found' });
  }

  if (room.creator.toString() !== req.user._id.toString()) {
    return res.status(403).json({ message: 'Only the creator can delete the room' });
  }

  let session = null;
  try {
    session = await mongoose.startSession();
    await session.withTransaction(async () => {
      await Apartment.findByIdAndUpdate(room.apartment, { $pull: { rooms: roomId } }, { session });
      await Device.deleteMany({ room: roomId }, { session });
      await Room.findByIdAndDelete(roomId, { session });
    });
    session.endSession();
    return res.json({ message: 'Room deleted successfully' });
  } catch (error) {
    if (session) session.endSession();
    // Fallback without transaction if standalone Mongo does not support transactions
    await Apartment.findByIdAndUpdate(room.apartment, { $pull: { rooms: roomId } });
    await Device.deleteMany({ room: roomId });
    await Room.findByIdAndDelete(roomId);
    return res.json({ message: 'Room deleted successfully' });
  }
};