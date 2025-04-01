const taskEvents = require('../taskEventEmitter');
const Task = require('../../models/Task');

function registerTaskHandlers(io) {
    taskEvents.on('task-executed', async (task) => {
        try {
            console.log(`Task executed: ${task.name}`);

            // Broadcast update to the device
            io.of('/ws/device').to(`device:${task.device._id}`).emit('task-update', {
                taskId: task._id,
                device: task.device._id,
                status: 'executed',
                message: `Task "${task.name}" was executed.`,
            });

            // Broadcast update to the user
            io.of('/ws/user').to(`user:${task.creator._id}`).emit('task-update', {
                taskId: task._id,
                user: task.creator._id,
                status: 'executed',
                message: `Your task "${task.name}" has been executed.`,
            });

        } catch (error) {
            console.error('Error broadcasting task execution:', error);
        }
    });

    taskEvents.on('task-failed', async (task, error) => {
        try {
            console.log(`Task failed: ${task.name}`);

            // Broadcast failure to the device
            io.of('/ws/device').to(`device:${task.device._id}`).emit('task-update', {
                taskId: task._id,
                device: task.device._id,
                status: 'failed',
                message: `Task "${task.name}" failed: ${error}`,
            });

            // Broadcast failure to the user
            io.of('/ws/user').to(`user:${task.creator._id}`).emit('task-update', {
                taskId: task._id,
                user: task.creator._id,
                status: 'failed',
                message: `Your task "${task.name}" failed: ${error}`,
            });

        } catch (err) {
            console.error('Error broadcasting task failure:', err);
        }
    });
}

module.exports = { registerTaskHandlers };