const Device = require('../../../models/Device');
const mongoose = require('mongoose');

exports.updateDeviceName = async (req, res) => {
  try {
    const { name } = req.body;
    const deviceId = req.params.id;

    // Validate the device ID
    if (!mongoose.Types.ObjectId.isValid(deviceId)) {
      return res.status(400).json({ message: 'Invalid device ID' });
    }

    // Try to find the device and check for the creator
    const device = await Device.findOne({ _id: deviceId, creator: req.user._id }).lean();
    if (!device) {
      return res.status(404).json({ message: 'Device not found or user is not authorized' });
    }

    // Update the device name
    device.name = name;

    // Save the updated device
    const updatedDevice = await Device.findByIdAndUpdate(deviceId, { name }, { new: true });

    // Return the updated device
    res.json(updatedDevice);
  } catch (error) {
    res.status(500).json({ message: 'Error updating device name', error: error.message });
  }
};