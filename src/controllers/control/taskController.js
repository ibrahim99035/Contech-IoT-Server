// controllers/taskController.js
const Task = require('../../models/Task');
const Device = require('../../models/Device');
const User = require('../../models/User');

// Create Task
exports.createTask = async (req, res) => {
  try {
    const { name, description, state, scheduledTime, repeatInterval, deviceId } = req.body;

    // Ensure the user has access to the device
    const device = await Device.findById(deviceId);
    if (!device) return res.status(404).json({ message: 'Device not found' });

    if (!device.users.includes(req.user.id)) {
      return res.status(403).json({ message: 'You do not have access to this device' });
    }

    const task = new Task({
      name,
      description,
      state,
      scheduledTime,
      repeatInterval,
      device: deviceId,
      user: req.user.id,
    });

    await task.save();

    // Add the task to the device's task list
    device.tasks.push(task._id);
    await device.save();

    // Add the task to the user's task list
    const user = await User.findById(req.user.id);
    user.tasks.push(task._id);
    await user.save();

    res.status(201).json({ message: 'Task created successfully', task });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Server error' });
  }
};

// Get Tasks by User
exports.getTasksByUser = async (req, res) => {
  try {
    const tasks = await Task.find({ user: req.user.id });
    res.status(200).json(tasks);
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Server error' });
  }
};

// Get Tasks by Device (Only users of the device)
exports.getTasksByDevice = async (req, res) => {
  try {
    const device = await Device.findById(req.params.deviceId);
    if (!device) return res.status(404).json({ message: 'Device not found' });

    if (!device.users.includes(req.user.id)) {
      return res.status(403).json({ message: 'You do not have access to this device' });
    }

    const tasks = await Task.find({ device: req.params.deviceId });
    res.status(200).json(tasks);
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Server error' });
  }
};

// Update Task (Only the creator can update)
exports.updateTask = async (req, res) => {
  try {
    const task = await Task.findById(req.params.id);
    if (!task) return res.status(404).json({ message: 'Task not found' });

    if (task.user.toString() !== req.user.id) {
      return res.status(403).json({ message: 'You are not authorized to update this task' });
    }

    const { name, description, state, scheduledTime, repeatInterval } = req.body;

    task.name = name || task.name;
    task.description = description || task.description;
    task.state = state || task.state;
    task.scheduledTime = scheduledTime || task.scheduledTime;
    task.repeatInterval = repeatInterval || task.repeatInterval;

    await task.save();

    res.status(200).json({ message: 'Task updated successfully', task });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Server error' });
  }
};

// Delete Task (Only the creator can delete)
exports.deleteTask = async (req, res) => {
  try {
    const task = await Task.findById(req.params.id);
    if (!task) return res.status(404).json({ message: 'Task not found' });

    if (task.user.toString() !== req.user.id) {
      return res.status(403).json({ message: 'You are not authorized to delete this task' });
    }

    await task.remove();

    // Remove task from device
    const device = await Device.findById(task.device);
    device.tasks.pull(task._id);
    await device.save();

    // Remove task from user
    const user = await User.findById(task.user);
    user.tasks.pull(task._id);
    await user.save();

    res.status(200).json({ message: 'Task deleted successfully' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Server error' });
  }
};