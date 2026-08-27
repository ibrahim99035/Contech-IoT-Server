const Apartment = require('../../../models/Apartment');
const User = require('../../../models/User');
const Room = require('../../../models/Room');
const Device = require('../../../models/Device');
const mongoose = require('mongoose');

exports.deleteApartment = async (req, res) => {
  let session = null;
  let useTransaction = false;

  try {
    const apartmentId = req.params.id;

    if (!mongoose.Types.ObjectId.isValid(apartmentId)) {
      return res.status(400).json({ message: 'Invalid apartment ID' });
    }

    try {
      session = await mongoose.startSession();
      session.startTransaction();
      useTransaction = true;
    } catch (e) {
      session = null;
      useTransaction = false;
    }

    const apartment = await Apartment.findById(apartmentId);
    if (!apartment) {
      if (useTransaction && session) {
        await session.abortTransaction();
        session.endSession();
      }
      return res.status(404).json({ message: 'Apartment not found' });
    }

    if (!apartment.creator.equals(req.user._id)) {
      if (useTransaction && session) {
        await session.abortTransaction();
        session.endSession();
      }
      return res.status(403).json({ message: 'Only the creator can delete the apartment' });
    }

    const rooms = await Room.find({ apartment: apartmentId }).select('_id');
    const roomIds = rooms.map(room => room._id);

    if (useTransaction && session) {
      try {
        await Device.deleteMany({ room: { $in: roomIds } }, { session });
        await Room.deleteMany({ apartment: apartmentId }, { session });
        await User.updateMany({ apartments: apartmentId }, { $pull: { apartments: apartmentId } }, { session });
        await Apartment.deleteOne({ _id: apartmentId }, { session });
        await session.commitTransaction();
        session.endSession();
      } catch (txError) {
        if (session.inTransaction()) await session.abortTransaction();
        session.endSession();
        await Device.deleteMany({ room: { $in: roomIds } });
        await Room.deleteMany({ apartment: apartmentId });
        await User.updateMany({ apartments: apartmentId }, { $pull: { apartments: apartmentId } });
        await Apartment.deleteOne({ _id: apartmentId });
      }
    } else {
      await Device.deleteMany({ room: { $in: roomIds } });
      await Room.deleteMany({ apartment: apartmentId });
      await User.updateMany({ apartments: apartmentId }, { $pull: { apartments: apartmentId } });
      await Apartment.deleteOne({ _id: apartmentId });
    }

    res.json({ message: 'Apartment deleted successfully' });
  } catch (error) {
    if (session && session.inTransaction()) {
      await session.abortTransaction();
      session.endSession();
    }
    res.status(500).json({ message: 'Error deleting apartment', error: error.message });
  }
};