const Device = require('../../../models/Device');
const logger = require('../../../config/logger');

/**
 * Toggle the activation status of a device.
 *
 * @param {Object} req - Express request object. Should have a deviceId in the parameters.
 * @param {Object} res - Express response object.
 * @returns {Promise<void>}
 */
exports.toggleActivation = async (req, res) => {
  try {
    const { deviceId } = req.params;
    const requestingUserId = req.user._id;

    if (!deviceId) {
      return res.status(400).json({
        success: false,
        message: 'Device ID is required'
      });
    }

    const device = await Device.findById(deviceId);

    if (!device) {
      logger.warn('Activation: device not found', { deviceId });
      return res.status(404).json({
        success: false,
        message: 'Device not found'
      });
    }

    // Access control: Only the creator of the device can toggle activation.
    if (!device.creator.equals(requestingUserId)) {
      logger.warn('Activation: unauthorized attempt', {
        deviceId,
        requestingUserId: String(requestingUserId),
        creatorId: String(device.creator)
      });
      return res.status(403).json({
        success: false,
        message: 'Unauthorized: Only the device creator can change the activation status.'
      });
    }

    // Toggle the activation status
    device.activated = !device.activated;
    await device.save();

    logger.info('Device activation status toggled', {
      deviceId: device._id,
      name: device.name,
      activated: device.activated
    });

    res.status(200).json({
      success: true,
      message: 'Device activation status toggled successfully',
      data: {
        deviceId: device._id,
        name: device.name,
        activated: device.activated,
      },
    });
  } catch (error) {
    logger.error('Error toggling device activation', { error: error.message });
    res.status(500).json({
      success: false,
      message: 'Failed to toggle device activation',
      error: process.env.NODE_ENV === 'production' ? 'Internal server error' : error.message
    });
  }
};
