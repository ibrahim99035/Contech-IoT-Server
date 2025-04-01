const Task = require('../../../models/Task');
const Device = require('../../../models/Device');
const taskSchema = require('../../../validation/taskValidator');

/**
 * @desc Create a new task
 * @route POST /api/tasks
 * @access Private
 */
exports.createTask = async (req, res) => {
    try {
        // Validate request body using Joi
        const { error } = taskSchema.validate(req.body, { abortEarly: false });
        if (error) {
            return res.status(400).json({ error: error.details.map(err => err.message) });
        }

        const { name, description, device, action, schedule, notifications, conditions } = req.body;
        const userId = req.user._id;

        // 🔍 Check if the device exists and fetch its access permissions
        const foundDevice = await Device.findById(device);
        if (!foundDevice) {
            return res.status(404).json({ error: 'Device not found' });
        }

        // 🔒 Check if user has permission to assign a task to this device
        if (String(foundDevice.creator) !== userId && !foundDevice.users.includes(userId)) {
            return res.status(403).json({ error: 'You do not have permission to assign tasks to this device' });
        }

        // ✅ Create the task
        const task = new Task({
            name,
            description,
            creator: userId,
            device,
            action,
            schedule,
            notifications,
            conditions,
        });

        await task.save();

        res.status(201).json({ message: 'Task created successfully', task });
    } catch (error) {
        console.error('Error creating task:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
};