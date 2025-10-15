const Task = require('../../../models/Task');
const Device = require('../../../models/Device');
const taskSchema = require('../../../validation/taskValidator');
const { checkTaskLimits } = require('../../../middleware/checkSubscriptionLimits');
const taskScheduler = require('../../../schedualr');
const moment = require('moment-timezone');

exports.createTask = async (req, res) => {
    try {
        // Validate request body
        const { error } = taskSchema.validate(req.body, { abortEarly: false });
        if (error) {
            return res.status(400).json({ 
                success: false,
                error: error.details.map(err => err.message) 
            });
        }

        const { name, description, device, action, schedule, notifications, conditions, timezone } = req.body;
        const userId = req.user._id;

        // FIXED: Validate timezone if provided
        const taskTimezone = timezone || 'UTC';
        if (!moment.tz.zone(taskTimezone)) {
            return res.status(400).json({ 
                success: false,
                error: `Invalid timezone: ${taskTimezone}` 
            });
        }

        // Check device exists and permissions
        const foundDevice = await Device.findById(device);
        if (!foundDevice) {
            return res.status(404).json({ 
                success: false,
                error: 'Device not found' 
            });
        }

        if (String(foundDevice.creator) !== String(userId) && !foundDevice.users.includes(userId)) {
            return res.status(403).json({ 
                success: false,
                error: 'You do not have permission to assign tasks to this device' 
            });
        }

        // FIXED: Validate custom recurrence has cronExpression
        if (schedule.recurrence.type === 'custom' && !schedule.recurrence.cronExpression) {
            return res.status(400).json({
                success: false,
                error: 'Custom recurrence type requires a cronExpression'
            });
        }

        // Create the task
        const task = new Task({
            name,
            description,
            creator: userId,
            device,
            action,
            schedule,
            notifications,
            conditions,
            timezone: taskTimezone,
            status: 'active'
        });

        // Save the task (this triggers pre-save hook to calculate nextExecution)
        await task.save();

        // FIXED: Populate the task before scheduling and returning
        await task.populate('device');
        await task.populate('creator', 'name email');
        
        if (notifications?.recipients?.length > 0) {
            await task.populate('notifications.recipients', 'name email');
        }
        
        if (conditions?.length > 0) {
            await task.populate('conditions.device', 'name type');
        }

        // FIXED: Better error handling for scheduling
        try {
            await taskScheduler.scheduleNewTask(task);
            console.log(`Task "${task.name}" scheduled successfully`);
        } catch (schedulingError) {
            console.error('Error scheduling task:', schedulingError);
            // Task is created but not scheduled - log warning but don't fail the request
            // The scheduler will pick it up in the next periodic check
            console.warn(`Task "${task.name}" created but not immediately scheduled. It will be picked up in the next scheduler cycle.`);
        }

        // FIXED: Get formatted execution time
        const formattedNextExecution = task.getFormattedNextExecution();

        // FIXED: Check if task has valid next execution
        if (!task.nextExecution) {
            console.warn(`Task "${task.name}" created but has no next execution time. Check schedule configuration.`);
        }

        res.status(201).json({ 
            success: true,
            message: 'Task created successfully', 
            data: {
                task: {
                    _id: task._id,
                    name: task.name,
                    description: task.description,
                    creator: {
                        _id: task.creator._id,
                        name: task.creator.name,
                        email: task.creator.email
                    },
                    device: {
                        _id: task.device._id,
                        name: task.device.name,
                        type: task.device.type,
                        status: task.device.status
                    },
                    action: task.action,
                    schedule: task.schedule,
                    notifications: task.notifications,
                    conditions: task.conditions,
                    timezone: task.timezone,
                    status: task.status,
                    nextExecution: task.nextExecution,
                    nextExecutionFormatted: formattedNextExecution,
                    lastExecuted: task.lastExecuted,
                    executionHistory: task.executionHistory,
                    createdAt: task.createdAt,
                    updatedAt: task.updatedAt
                }
            }
        });
    } catch (error) {
        console.error('Error creating task:', error);
        
        // FIXED: Better error response
        if (error.name === 'ValidationError') {
            return res.status(400).json({ 
                success: false,
                error: 'Validation error',
                details: Object.values(error.errors).map(err => err.message)
            });
        }
        
        res.status(500).json({ 
            success: false,
            error: 'Internal server error',
            message: process.env.NODE_ENV === 'development' ? error.message : undefined
        });
    }
};