const Device = require('../../../models/Device');
const Room = require('../../../models/Room');
const mongoose = require('mongoose');
const { invalidateCache } = require('../../../utils/cacheUtils');

exports.deleteDevice = async (req, res) => {
  try {
    const deviceId = req.params.id;

    if (!mongoose.Types.ObjectId.isValid(deviceId)) return res.status(400).json({ message: 'Invalid device ID' });

    const device = await Device.findById(deviceId);
    if (!device) return res.status(404).json({ message: 'Device not found' });

    if (device.creator.toString() !== req.user._id.toString()) {
      return res.status(403).json({ message: 'Only the creator can delete the device.' });
    }

    await Room.findByIdAndUpdate(device.room, { $pull: { devices: deviceId } });
    await device.remove();

    invalidateCache(`devices:${device.room}`);
    res.json({ message: 'Device deleted successfully' });
  } catch (error) {
    res.status(500).json({ message: 'Error deleting device', error: error.message });
  }
};