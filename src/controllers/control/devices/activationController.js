const Device = require('../../../models/Device');

/**
 * Toggle the activation status of a device.
 *
 * @param {Object} req - Express request object.  Should have a deviceId in the parameters.
 * @param {Object} res - Express response object.
 * @returns {Promise<void>}
 */
exports.toggleActivation = async (req, res) => {
  try {
    const { deviceId } = req.params;
    const requestingUserId = req.user._id;

    console.log(`[ActivationController] Attempting to toggle activation for device ID: ${deviceId} by user ID: ${requestingUserId}`);

    if (!deviceId) {
      console.log('[ActivationController] Error: Device ID is missing from request parameters.');
      return res.status(400).json({ 
        success: false, 
        message: 'Device ID is required' 
      });
    }

    const device = await Device.findById(deviceId);

    if (!device) {
      console.log(`[ActivationController] Error: Device not found with ID: ${deviceId}`);
      return res.status(404).json({ 
        success: false, 
        message: 'Device not found' 
      });
    }

    console.log(`[ActivationController] Device found: ${device.name}, Creator ID: ${device.creator}`);

    // Access control: Only the creator of the device can toggle activation.
    if (!device.creator.equals(requestingUserId)) {
      console.log(`[ActivationController] Authorization failed: User ${requestingUserId} is not the creator of device ${deviceId}. Creator is ${device.creator}.`);
      return res.status(403).json({ 
        success: false, 
        message: 'Unauthorized: Only the device creator can change the activation status.' 
      });
    }

    console.log(`[ActivationController] User ${requestingUserId} authorized as creator. Current activation status: ${device.activated}`);

    // Toggle the activation status
    device.activated = !device.activated;
    await device.save();

    console.log(`[ActivationController] Device ${deviceId} activation status toggled to: ${device.activated}`);

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
    console.error('[ActivationController] Error toggling device activation:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Failed to toggle device activation', 
      error: process.env.NODE_ENV === 'production' ? 'Internal server error' : error.message 
    });
  }
};