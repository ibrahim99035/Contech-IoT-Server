const Task = require('../../../models/Task');
const Device = require('../../../models/Device');
const mongoose = require('mongoose');

/**
 * @desc    Delete a task
 * @route   DELETE /api/tasks/:taskId
 * @access  Private
 */
exports.deleteTask = async (req, res) => {
    try {
        // Check if user exists in request
        if (!req.user) {
            return res.status(401).json({ error: 'Authentication required' });
        }

        const { taskId } = req.params;
        const userId = req.user._id;

        // ✅ Validate taskId
        if (!mongoose.Types.ObjectId.isValid(taskId)) {
            return res.status(400).json({ error: 'Invalid task ID' });
        }

        // 🔍 Fetch the task and ensure it exists
        const task = await Task.findById(taskId);
        if (!task) {
            return res.status(404).json({ error: 'Task not found' });
        }

        // 🔍 Fetch the associated device
        const device = await Device.findById(task.device);
        if (!device) {
            return res.status(404).json({ error: 'Associated device not found' });
        }

        // 🔒 Authorization: Use proper ObjectId comparison methods
        const isTaskCreator = task.creator.equals ? 
            task.creator.equals(userId) : 
            String(task.creator) === String(userId);
            
        const isDeviceCreator = device.creator.equals ? 
            device.creator.equals(userId) : 
            String(device.creator) === String(userId);

        if (!isTaskCreator && !isDeviceCreator) {
            return res.status(403).json({ error: 'Unauthorized: You cannot delete this task' });
        }

        // 🚀 Delete task
        await Task.deleteOne({ _id: taskId });

        // 🔄 Remove task reference from the Device model
        await Device.updateOne({ _id: device._id }, { $pull: { tasks: taskId } });

        res.status(200).json({ message: 'Task deleted successfully' });
    } catch (error) {
        console.error('Error deleting task:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
};