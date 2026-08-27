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
  let session = null;
  let useTransaction = false;

  try {
    const deviceId = req.params.id;

    if (!mongoose.Types.ObjectId.isValid(deviceId)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid device ID format',
        code: 'INVALID_ID_FORMAT'
      });
    }

    if (!req.user?._id) {
      return res.status(401).json({
        success: false,
        message: 'Authentication required',
        code: 'UNAUTHORIZED'
      });
    }

    const device = await Device.findById(deviceId);
    if (!device) {
      return res.status(404).json({
        success: false,
        message: 'Device not found',
        code: 'DEVICE_NOT_FOUND'
      });
    }

    if (device.creator.toString() !== req.user._id.toString()) {
      return res.status(403).json({
        success: false,
        message: 'Permission denied: only the device creator can delete it',
        code: 'PERMISSION_DENIED'
      });
    }

    const deviceInfo = {
      _id: device._id,
      name: device.name,
      type: device.type,
      roomId: device.room
    };

    try {
      session = await mongoose.startSession();
      session.startTransaction();
      useTransaction = true;
    } catch (e) {
      session = null;
      useTransaction = false;
    }

    const associatedTasks = await Task.find({
      $or: [
        { device: deviceId },
        { 'conditions.device': deviceId }
      ]
    });

    const taskInfo = { total: associatedTasks.length, mainTasks: [], conditionTasks: [] };

    for (const task of associatedTasks) {
      const taskData = { _id: task._id, name: task.name };
      if (task.device.toString() === deviceId) {
        task.status = 'cancelled';
        task.nextExecution = null;
        await task.save();
        taskInfo.mainTasks.push(taskData);
      } else {
        task.conditions = task.conditions.filter(condition => 
          !condition.device || condition.device.toString() !== deviceId
        );
        await task.save();
        taskInfo.conditionTasks.push(taskData);
      }
    }

    await Device.deleteOne({ _id: deviceId });

    let roomInfo = null;
    if (device.room) {
      const room = await Room.findByIdAndUpdate(
        device.room, 
        { $pull: { devices: deviceId } }, 
        { new: true }
      ).populate('devices', '_id name type');
      
      if (room) {
        roomInfo = {
          _id: room._id,
          name: room.name,
          remainingDevices: room.devices.length
        };
      }
    }

    if (useTransaction && session) {
      try {
        await session.commitTransaction();
      } catch (txErr) {
        if (session.inTransaction()) await session.abortTransaction();
      }
      session.endSession();
    }

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
    if (session && session.inTransaction()) {
      await session.abortTransaction();
      session.endSession();
    }
    
    res.status(500).json({
      success: false,
      message: 'Error deleting device',
      error: error.message,
      code: 'SERVER_ERROR'
    });
  }
};