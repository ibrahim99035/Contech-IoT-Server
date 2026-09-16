const Task = require('../../../models/Task');
const Device = require('../../../models/Device');
const { ObjectId } = require('mongoose').Types;
const logger = require('../../../config/logger');

exports.getTaskById = async (req, res) => {
  try {
    if (!req.user) {
      return res.status(401).json({ error: 'Authentication required: User not found in request' });
    }

    const { taskId } = req.params;
    const userId = req.user._id;

    if (!ObjectId.isValid(taskId)) {
      return res.status(400).json({ error: 'Invalid Task ID' });
    }

    const task = await Task.findById(taskId)
      .populate('device', 'name')
      .populate('creator', 'name');

    if (!task) {
      return res.status(404).json({ error: 'Task not found' });
    }

    const device = await Device.findById(task.device);
    if (!device) {
      return res.status(404).json({ error: 'Associated device not found' });
    }

    const isCreator = task.creator.equals(userId);
    const isDeviceCreator = device.creator.equals(userId);
    const isDeviceUser = device.users.includes(userId);

    if (!(isCreator || isDeviceCreator || isDeviceUser)) {
      return res.status(403).json({ error: 'Access denied' });
    }

    res.status(200).json({ task });
  } catch (error) {
    logger.error('Error in getTaskById', { error: error.message });
    res.status(500).json({ error: 'Server error', message: error.message });
  }
};

exports.getMyTasks = async (req, res) => {
  try {
    if (!req.user) {
      return res.status(401).json({ error: 'Authentication required: User not found in request' });
    }

    const userId = req.user._id;
    if (!userId) {
      return res.status(401).json({ error: 'Invalid user ID' });
    }

    if (typeof Task === 'undefined') {
      return res.status(500).json({ error: 'Server misconfiguration: Task model not available' });
    }

    const tasks = await Task.find({ creator: userId })
      .select('name device status nextExecution')
      .populate({
        path: 'device',
        select: 'name',
        options: { strictPopulate: false },
      })
      .lean();

    if (!Array.isArray(tasks)) {
      logger.warn('Task.find did not return an array. Normalizing...');
    }

    const safeTasks = Array.isArray(tasks) ? tasks : [];
    return res.status(200).json({ tasks: safeTasks });
  } catch (error) {
    logger.error('Exception thrown in getMyTasks', { error: error.message, stack: error.stack });

    if (error.name === 'CastError') {
      return res.status(400).json({ error: 'Invalid user ID format' });
    }

    if (error.name === 'ValidationError') {
      return res.status(400).json({ error: 'Validation error', details: error.message });
    }

    return res.status(500).json({
      error: 'Server error',
      message: process.env.NODE_ENV === 'production' ? 'Internal server error' : error.message
    });
  }
};

exports.getTasksByDevice = async (req, res) => {
  try {
    if (!req.user) {
      return res.status(401).json({ error: 'Authentication required: User not found in request' });
    }

    const { deviceId } = req.params;
    const userId = req.user._id;

    if (!ObjectId.isValid(deviceId)) {
      return res.status(400).json({ error: 'Invalid Device ID' });
    }

    const device = await Device.findById(deviceId);
    if (!device) {
      return res.status(404).json({ error: 'Device not found' });
    }

    const isCreator = device.creator.equals(userId);
    const isUser = device.users.includes(userId);
    if (!(isCreator || isUser)) {
      return res.status(403).json({ error: 'Access denied' });
    }

    const tasks = await Task.find({ device: deviceId })
      .populate('device', 'name')
      .populate('creator', 'name');

    res.status(200).json({ device: device.name, tasks });
  } catch (error) {
    logger.error('Error in getTasksByDevice', { error: error.message });
    res.status(500).json({ error: 'Server error', message: error.message });
  }
};

exports.getAssignedTasks = async (req, res) => {
  try {
    if (!req.user) {
      return res.status(401).json({ error: 'Authentication required: User not found in request' });
    }

    const userId = req.user._id;

    const tasks = await Task.find({ 'notifications.recipients': userId })
      .select('name device status nextExecution')
      .populate('device', 'name');

    res.status(200).json({ tasks });
  } catch (error) {
    logger.error('Error in getAssignedTasks', { error: error.message });
    res.status(500).json({ error: 'Server error', message: error.message });
  }
};

exports.getFilteredTasks = async (req, res) => {
  try {
    if (!req.user) {
      return res.status(401).json({ error: 'Authentication required: User not found in request' });
    }

    const { status, startDate, endDate, sort, limit = 10, page = 1 } = req.query;
    const userId = req.user._id;

    const query = { creator: userId };

    if (status) {
      query.status = status;
    }

    if (startDate) {
      query['schedule.startDate'] = { $gte: new Date(startDate) };
    }

    if (endDate) {
      query['schedule.endDate'] = { ...query['schedule.endDate'], $lte: new Date(endDate) };
    }

    const skip = (parseInt(page) - 1) * parseInt(limit);
    const sortOption = sort ? { [sort]: 1 } : { nextExecution: 1 };

    const tasks = await Task.find(query)
      .select('name status nextExecution')
      .sort(sortOption)
      .skip(skip)
      .limit(parseInt(limit))
      .lean();

    const totalTasks = await Task.countDocuments(query);
    const totalPages = Math.ceil(totalTasks / limit);

    res.status(200).json({
      tasks,
      pagination: { totalTasks, totalPages, currentPage: parseInt(page), limit: parseInt(limit) }
    });
  } catch (error) {
    logger.error('Error in getFilteredTasks', { error: error.message });
    res.status(500).json({ error: 'Server error', message: error.message });
  }
};