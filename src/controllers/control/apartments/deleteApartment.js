const Apartment = require('../../../models/Apartment');
const User = require('../../../models/User');
const Room = require('../../../models/Room');
const Device = require('../../../models/Device');
const mongoose = require('mongoose');
const { runInTxn } = require('../../../utils/transaction')(mongoose);

exports.deleteApartment = async (req, res) => {
<<<<<<< Updated upstream
  const session = await mongoose.startSession();

=======
>>>>>>> Stashed changes
  try {
    session.startTransaction();
    const apartmentId = req.params.id;

    // Validate Apartment ID
    if (!mongoose.Types.ObjectId.isValid(apartmentId)) {
      await session.abortTransaction();
      session.endSession();
      return res.status(400).json({ message: 'Invalid apartment ID' });
    }

<<<<<<< Updated upstream
    // Find Apartment
    const apartment = await Apartment.findById(apartmentId).session(session);
    if (!apartment) {
      await session.abortTransaction();
      session.endSession();
      return res.status(404).json({ message: 'Apartment not found' });
    }

    // Check if the user is the creator
    if (!apartment.creator.equals(req.user._id)) {
      await session.abortTransaction();
      session.endSession();
      return res.status(403).json({ message: 'Only the creator can delete the apartment' });
    }

    // Find all rooms in the apartment
    const rooms = await Room.find({ apartment: apartmentId }).select('_id').session(session);
    const roomIds = rooms.map(room => room._id);

    // Delete devices associated with the rooms
    await Device.deleteMany({ room: { $in: roomIds } }, { session });

    // Delete all rooms linked to the apartment
    await Room.deleteMany({ apartment: apartmentId }, { session });

    // Remove apartment reference from users
    await User.updateMany({ apartments: apartmentId }, { $pull: { apartments: apartmentId } }, { session });

    // Delete the apartment itself
    await Apartment.deleteOne({ _id: apartmentId }, { session });

    // Commit transaction
    await session.commitTransaction();
    session.endSession();

    res.json({ message: 'Apartment deleted successfully' });
  } catch (error) {
    if (session.inTransaction()) {
      await session.abortTransaction();
    }
    session.endSession();

    res.status(500).json({ message: 'Error deleting apartment', error: error.message });
=======
    let apartment;
    await runInTxn(async (session) => {
      const opts = session ? { session } : {};

      apartment = await Apartment.findById(apartmentId, null, opts);
      if (!apartment) {
        throw { status: 404, message: 'Apartment not found' };
      }

      if (!apartment.creator.equals(req.user._id)) {
        throw { status: 403, message: 'Only the creator can delete the apartment' };
      }

      const rooms = await Room.find({ apartment: apartmentId }).select('_id').lean();
      const roomIds = rooms.map(r => r._id);

      await Device.deleteMany({ room: { $in: roomIds } }, opts);
      await Room.deleteMany({ apartment: apartmentId }, opts);
      await User.updateMany({ apartments: apartmentId }, { $pull: { apartments: apartmentId } }, opts);
      await Apartment.deleteOne({ _id: apartmentId }, opts);
    }).then(
      () => res.json({ message: 'Apartment deleted successfully' }),
      (err) => {
        if (err.status) return res.status(err.status).json({ message: err.message });
        return res.status(500).json({ message: 'Error deleting apartment', error: err.message });
      }
    );
  } catch (err) {
    return res.status(500).json({ message: 'Error deleting apartment', error: err.message });
>>>>>>> Stashed changes
  }
};
