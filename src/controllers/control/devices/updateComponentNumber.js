const Device = require('../../../models/Device');
const mongoose = require('mongoose');
const crypto = require('crypto');

exports.updateComponentNumber = async (req, res) => {
  try {
    const { componentNumber } = req.body;
    const deviceId = req.params.id;

    if (!mongoose.Types.ObjectId.isValid(deviceId)) return res.status(400).json({ message: 'Invalid device ID' });

    const device = await Device.findById(deviceId);
    if (!device) return res.status(404).json({ message: 'Device not found' });

    if (device.creator.toString() !== req.user._id.toString()) {
      return res.status(403).json({ message: 'Only the creator can update the component number.' });
    }

    device.componentNumber = crypto.createHash('sha256').update(componentNumber).digest('hex');
    await device.save();

    res.json({ message: 'Component number updated successfully' });
  } catch (error) {
    res.status(500).json({ message: 'Error updating component number', error: error.message });
  }
};