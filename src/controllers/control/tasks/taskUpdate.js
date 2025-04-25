const Task = require('../../../models/Task');
const Device = require('../../../models/Device');
const Joi = require('joi');
const { ObjectId } = require('mongoose').Types;

exports.updateTaskDetails = async (req, res) => {
    try {
        const { taskId } = req.params;
        const userId = req.user._id;

        if (!ObjectId.isValid(taskId)) return res.status(400).json({ error: 'Invalid Task ID' });

        // Validation Schema
        const schema = Joi.object({
            name: Joi.string().min(3).max(100),
            description: Joi.string().allow(''),
            action: Joi.object({
                type: Joi.string().valid('status_change', 'temperature_set', 'other'),
                value: Joi.alternatives().try(Joi.string(), Joi.number(), Joi.object())
            })
        });

        const { error, value } = schema.validate(req.body);
        if (error) return res.status(400).json({ error: error.details[0].message });

        // Find task & validate access
        const task = await Task.findById(taskId);
        if (!task) return res.status(404).json({ error: 'Task not found' });

        const device = await Device.findById(task.device);
        const isAuthorized = task.creator.equals(userId) || device.creator.equals(userId) || device.users.includes(userId);
        if (!isAuthorized) return res.status(403).json({ error: 'Access denied' });

        // Update Task
        const updatedTask = await Task.findByIdAndUpdate(taskId, { $set: value }, { new: true });

        res.status(200).json({ message: 'Task updated successfully', task: updatedTask });

    } catch (error) {
        console.error(error);
        res.status(500).json({ error: 'Server error' });
    }
};

exports.updateTaskSchedule = async (req, res) => {
    try {
        const { taskId } = req.params;
        const userId = req.user._id;

        if (!ObjectId.isValid(taskId)) return res.status(400).json({ error: 'Invalid Task ID' });

        // Validation Schema
        const schema = Joi.object({
            schedule: Joi.object({
                startDate: Joi.date().required(),
                startTime: Joi.string().pattern(/^([0-1]?[0-9]|2[0-3]):[0-5][0-9]$/).required(),
                endDate: Joi.date().optional(),
                recurrence: Joi.object({
                    type: Joi.string().valid('once', 'daily', 'weekly', 'monthly', 'custom').required(),
                    daysOfWeek: Joi.array().items(Joi.number().min(0).max(6)),
                    dayOfMonth: Joi.number().min(1).max(31),
                    cronExpression: Joi.string().optional(),
                    interval: Joi.number().min(1).default(1)
                })
            }).required()
        });

        const { error, value } = schema.validate(req.body);
        if (error) return res.status(400).json({ error: error.details[0].message });

        // Find task & validate access
        const task = await Task.findById(taskId);
        if (!task) return res.status(404).json({ error: 'Task not found' });

        const device = await Device.findById(task.device);
        const isAuthorized = task.creator.equals(userId) || device.creator.equals(userId) || device.users.includes(userId);
        if (!isAuthorized) return res.status(403).json({ error: 'Access denied' });

        // Update Task Schedule
        task.schedule = value.schedule;
        task.updateNextExecution(); // Recalculate next execution
        await task.save();

        res.status(200).json({ message: 'Task schedule updated', task });

    } catch (error) {
        console.error(error);
        res.status(500).json({ error: 'Server error' });
    }
};

exports.updateTaskStatus = async (req, res) => {
    try {
        const { taskId } = req.params;
        const { status } = req.body;
        const userId = req.user._id;

        if (!ObjectId.isValid(taskId)) return res.status(400).json({ error: 'Invalid Task ID' });

        // Validation
        const schema = Joi.object({
            status: Joi.string().valid('scheduled', 'active', 'completed', 'failed', 'cancelled').required()
        });

        const { error } = schema.validate({ status });
        if (error) return res.status(400).json({ error: error.details[0].message });

        // Find task & validate access
        const task = await Task.findById(taskId);
        if (!task) return res.status(404).json({ error: 'Task not found' });

        const device = await Device.findById(task.device);
        const isAuthorized = task.creator.equals(userId) || device.creator.equals(userId) || device.users.includes(userId);
        if (!isAuthorized) return res.status(403).json({ error: 'Access denied' });

        // Update Status
        task.status = status;
        await task.save();

        res.status(200).json({ message: 'Task status updated', task });

    } catch (error) {
        console.error(error);
        res.status(500).json({ error: 'Server error' });
    }
};

exports.addNotificationRecipient = async (req, res) => {
    try {
        const { taskId } = req.params;
        const { recipientId } = req.body;
        const userId = req.user._id;

        if (!ObjectId.isValid(taskId) || !ObjectId.isValid(recipientId)) 
            return res.status(400).json({ error: 'Invalid ID' });

        // Find task & validate access
        const task = await Task.findById(taskId);
        if (!task) return res.status(404).json({ error: 'Task not found' });

        const device = await Device.findById(task.device);
        const isAuthorized = task.creator.equals(userId) || device.creator.equals(userId) || device.users.includes(userId);
        if (!isAuthorized) return res.status(403).json({ error: 'Access denied' });

        // Add recipient
        if (!task.notifications.recipients.includes(recipientId)) {
            task.notifications.recipients.push(recipientId);
            await task.save();
        }

        res.status(200).json({ message: 'Recipient added', task });

    } catch (error) {
        console.error(error);
        res.status(500).json({ error: 'Server error' });
    }
};