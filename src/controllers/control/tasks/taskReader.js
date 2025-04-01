const Task = require('../../../models/Task');
const Device = require('../../../models/Device');
const { ObjectId } = require('mongoose').Types;

exports.getTaskById = async (req, res) => {
    try {
        const { taskId } = req.params;
        const userId = req.user._id;

        if (!ObjectId.isValid(taskId)) return res.status(400).json({ error: 'Invalid Task ID' });

        const task = await Task.findById(taskId)
            .populate('device', 'name')
            .populate('creator', 'name');

        if (!task) return res.status(404).json({ error: 'Task not found' });

        // Verify access
        const device = await Device.findById(task.device);
        const isAuthorized = task.creator.equals(userId) || device.creator.equals(userId) || device.users.includes(userId);

        if (!isAuthorized) return res.status(403).json({ error: 'Access denied' });

        res.status(200).json({ task });

    } catch (error) {
        console.error(error);
        res.status(500).json({ error: 'Server error' });
    }
};

exports.getMyTasks = async (req, res) => {
    try {
        const userId = req.user._id;

        const tasks = await Task.find({ creator: userId })
            .select('name device status nextExecution')
            .populate('device', 'name');

        res.status(200).json({ tasks });

    } catch (error) {
        console.error(error);
        res.status(500).json({ error: 'Server error' });
    }
};

exports.getTasksByDevice = async (req, res) => {
    try {
        const { deviceId } = req.params;
        const userId = req.user._id;

        if (!ObjectId.isValid(deviceId)) return res.status(400).json({ error: 'Invalid Device ID' });

        const device = await Device.findById(deviceId);
        if (!device) return res.status(404).json({ error: 'Device not found' });

        const isAuthorized = device.creator.equals(userId) || device.users.includes(userId);
        if (!isAuthorized) return res.status(403).json({ error: 'Access denied' });

        const tasks = await Task.find({ device: deviceId })
            .select('name status nextExecution');

        res.status(200).json({ device: device.name, tasks });

    } catch (error) {
        console.error(error);
        res.status(500).json({ error: 'Server error' });
    }
};

exports.getAssignedTasks = async (req, res) => {
    try {
        const userId = req.user._id;

        const tasks = await Task.find({ 'notifications.recipients': userId })
            .select('name device status nextExecution')
            .populate('device', 'name');

        res.status(200).json({ tasks });

    } catch (error) {
        console.error(error);
        res.status(500).json({ error: 'Server error' });
    }
};

exports.getFilteredTasks = async (req, res) => {
    try {
        const { status, startDate, endDate, sort, limit = 10, page = 1 } = req.query;
        const userId = req.user._id;

        const query = { creator: userId };

        // Filter by status
        if (status) query.status = status;

        // Filter by date range
        if (startDate) query['schedule.startDate'] = { $gte: new Date(startDate) };
        if (endDate) query['schedule.endDate'] = { ...query['schedule.endDate'], $lte: new Date(endDate) };

        // Pagination & sorting
        const skip = (parseInt(page) - 1) * parseInt(limit);
        const sortOption = sort ? { [sort]: 1 } : { nextExecution: 1 };

        const tasks = await Task.find(query)
            .select('name status nextExecution')
            .sort(sortOption)
            .skip(skip)
            .limit(parseInt(limit))
            .lean();

        // Total count for pagination
        const totalTasks = await Task.countDocuments(query);
        const totalPages = Math.ceil(totalTasks / limit);

        res.status(200).json({
            tasks,
            pagination: { totalTasks, totalPages, currentPage: parseInt(page), limit: parseInt(limit) }
        });

    } catch (error) {
        console.error(error);
        res.status(500).json({ error: 'Server error' });
    }
};