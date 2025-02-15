const Device = require('../../../models/Device');
const Room = require('../../../models/Room');
const mongoose = require('mongoose');

exports.deleteDevice = async (req, res) => {
  const session = await mongoose.startSession();
  session.startTransaction();

  try {
    const deviceId = req.params.id;

    if (!mongoose.Types.ObjectId.isValid(deviceId)) {
      return res.status(400).json({ message: 'Invalid device ID' });
    }

    if (!req.user?._id) {
      return res.status(401).json({ message: 'Unauthorized access' });
    }

    // Find and delete device in one step
    const device = await Device.findOneAndDelete(
      { _id: deviceId, creator: req.user._id }, 
      { session }
    );

    if (!device) {
      return res.status(404).json({ message: 'Device not found or unauthorized' });
    }

    // Ensure room exists before updating
    if (device.room) {
      await Room.findByIdAndUpdate(device.room, { $pull: { devices: deviceId } }, { session });
    }

    await session.commitTransaction();
    session.endSession();

    res.json({ message: 'Device deleted successfully' });
  } catch (error) {
    await session.abortTransaction();
    session.endSession();
    res.status(500).json({ message: 'Error deleting device', error: error.message });
  }
};