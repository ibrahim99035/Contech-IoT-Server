const Apartment = require('../../../models/Apartment');
const User = require('../../../models/User');
const Room = require('../../../models/Room');
const Device = require('../../../models/Device');
const mongoose = require('mongoose');
const { invalidateCache } = require('../../../utils/cacheUtils');

exports.deleteApartment = async (req, res) => {
  const session = await mongoose.startSession();
  try {
    session.startTransaction();
    const apartmentId = req.params.id;

    if (!mongoose.Types.ObjectId.isValid(apartmentId)) return res.status(400).json({ message: 'Invalid apartment ID' });

    const apartment = await Apartment.findById(apartmentId);
    if (!apartment) throw new Error('Apartment not found');

    if (apartment.creator.toString() !== req.user._id.toString()) {
      return res.status(403).json({ message: 'Only the creator can delete the apartment' });
    }

    await Apartment.findByIdAndDelete(apartmentId, { session });
    await User.updateMany({ apartments: apartmentId }, { $pull: { apartments: apartmentId } }, { session });
    await Room.deleteMany({ apartment: apartmentId }, { session });
    await Device.deleteMany({ apartment: apartmentId }, { session });

    await session.commitTransaction();
    session.endSession();

    invalidateCache('apartments');
    res.json({ message: 'Apartment deleted successfully' });
  } catch (error) {
    await session.abortTransaction();
    session.endSession();
    res.status(500).json({ message: 'Error deleting apartment', error: error.message });
  }
};