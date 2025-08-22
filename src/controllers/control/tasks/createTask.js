const Task = require('../../../models/Task');
const Device = require('../../../models/Device');
const taskSchema = require('../../../validation/taskValidator');
const { checkTaskLimits } = require('../../../middleware/checkSubscriptionLimits');
const taskScheduler = require('../../../schedualr');

exports.createTask = async (req, res) => {
    try {
        // Validate request body
        const { error } = taskSchema.validate(req.body, { abortEarly: false });
        if (error) {
            return res.status(400).json({ error: error.details.map(err => err.message) });
        }

        const { name, description, device, action, schedule, notifications, conditions, timezone } = req.body;
        const userId = req.user._id;

        // Check device exists and permissions
        const foundDevice = await Device.findById(device);
        if (!foundDevice) {
            return res.status(404).json({ error: 'Device not found' });
        }

        if (String(foundDevice.creator) !== String(userId) && !foundDevice.users.includes(userId)) {
            return res.status(403).json({ error: 'You do not have permission to assign tasks to this device' });
        }

        // The limit check is now handled by middleware
        const task = new Task({
            name,
            description,
            creator: userId,
            device,
            action,
            schedule,
            notifications,
            conditions,
            timezone: timezone || 'UTC',
            status: 'active'
        });

        await task.save();

        await taskScheduler.scheduleNewTask(task);

        const formattedNextExecution = task.getFormattedNextExecution();

        res.status(201).json({ 
            success: true,
            message: 'Task created successfully', 
            data: {
                task: {
                    ...task.toObject(),
                    nextExecutionFormatted: formattedNextExecution
                }
            }
        });
    } catch (error) {
        console.error('Error creating task:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
};