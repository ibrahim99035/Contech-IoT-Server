/**
 * Device Controller - handles the deletion of IoT devices
 * @module controllers/DeviceController
 */

const Device = require('../../../models/Device');
const Room = require('../../../models/Room');
const Task = require('../../../models/Task');
const mongoose = require('mongoose');

/**
 * Deletes a device and removes all references to it from rooms and tasks
 * 
 * @async
 * @function deleteDevice
 * @param {Object} req - Express request object
 * @param {Object} req.params - URL parameters
 * @param {string} req.params.id - Device ID to delete
 * @param {Object} req.user - Authenticated user information
 * @param {Object} res - Express response object
 * @returns {Object} JSON response with success status or error message
 */
exports.deleteDevice = async (req, res) => {
  const session = await mongoose.startSession();
  session.startTransaction();

  try {
    const deviceId = req.params.id;

    // Validate device ID format
    if (!mongoose.Types.ObjectId.isValid(deviceId)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid device ID format',
        code: 'INVALID_ID_FORMAT'
      });
    }

    // Check authentication
    if (!req.user?._id) {
      return res.status(401).json({
        success: false,
        message: 'Authentication required',
        code: 'UNAUTHORIZED'
      });
    }

    // Find device before deletion to capture details for response
    const device = await Device.findById(deviceId).session(session);
    
    if (!device) {
      return res.status(404).json({
        success: false,
        message: 'Device not found',
        code: 'DEVICE_NOT_FOUND'
      });
    }

    // Verify ownership - only creator can delete
    if (device.creator.toString() !== req.user._id.toString()) {
      return res.status(403).json({
        success: false,
        message: 'Permission denied: only the device creator can delete it',
        code: 'PERMISSION_DENIED'
      });
    }

    // Store device info for response
    const deviceInfo = {
      _id: device._id,
      name: device.name,
      type: device.type,
      roomId: device.room
    };

    // Find tasks associated with this device
    // Based on the Task model: device field is the main reference, and conditions may have device references
    const associatedTasks = await Task.find({
      $or: [
        { device: deviceId },
        { 'conditions.device': deviceId }
      ]
    }).session(session);

    // Store task info for response
    const taskInfo = {
      total: associatedTasks.length,
      mainTasks: [],
      conditionTasks: []
    };

    // Process each affected task
    for (const task of associatedTasks) {
      const taskData = {
        _id: task._id,
        name: task.name
      };

      // Check if this is a main device task or a condition-only reference
      if (task.device.toString() === deviceId) {
        // This is a main task for the device - we need to cancel it
        task.status = 'cancelled';
        task.nextExecution = null;
        await task.save({ session });
        taskInfo.mainTasks.push(taskData);
      } else {
        // This is a task that uses the device in conditions
        // Remove the device from conditions
        task.conditions = task.conditions.filter(condition => 
          !condition.device || condition.device.toString() !== deviceId
        );
        await task.save({ session });
        taskInfo.conditionTasks.push(taskData);
      }
    }

    // Perform the device deletion
    await Device.deleteOne({ _id: deviceId }).session(session);

    // Update associated room by removing device reference
    let roomInfo = null;
    if (device.room) {
      const room = await Room.findByIdAndUpdate(
        device.room, 
        { $pull: { devices: deviceId } }, 
        { new: true, session }
      ).populate('devices', '_id name type');
      
      // Include room info in response if available
      if (room) {
        roomInfo = {
          _id: room._id,
          name: room.name,
          remainingDevices: room.devices.length
        };
      }
    }

    await session.commitTransaction();
    session.endSession();

    // Return success response with detailed information
    res.status(200).json({
      success: true,
      message: 'Device deleted successfully',
      data: {
        deletedDevice: deviceInfo,
        room: roomInfo,
        tasks: {
          total: taskInfo.total,
          cancelled: taskInfo.mainTasks.length,
          modified: taskInfo.conditionTasks.length,
          details: {
            cancelled: taskInfo.mainTasks,
            modified: taskInfo.conditionTasks
          }
        }
      }
    });

  } catch (error) {
    // Rollback transaction on error
    await session.abortTransaction();
    session.endSession();
    
    // Return error response
    res.status(500).json({
      success: false,
      message: 'Error deleting device',
      error: error.message,
      code: 'SERVER_ERROR'
    });
  }
};