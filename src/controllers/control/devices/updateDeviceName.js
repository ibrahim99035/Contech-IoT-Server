const Device = require('../../../models/Device');
const mongoose = require('mongoose');
const { invalidateCache } = require('../../../utils/cacheUtils');

exports.updateDeviceName = async (req, res) => {
  try {
    const { name } = req.body;
    const deviceId = req.params.id;

    if (!mongoose.Types.ObjectId.isValid(deviceId)) return res.status(400).json({ message: 'Invalid device ID' });

    const device = await Device.findById(deviceId);
    if (!device) return res.status(404).json({ message: 'Device not found' });

    if (device.creator.toString() !== req.user._id.toString()) {
      return res.status(403).json({ message: 'Only the creator can update the name.' });
    }

    device.name = name;
    await device.save();

    invalidateCache(`devices:${device.room}`);
    res.json(device);
  } catch (error) {
    res.status(500).json({ message: 'Error updating device name', error: error.message });
  }
};