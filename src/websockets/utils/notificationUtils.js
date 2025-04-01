function sendNotification(io, task, status, updatedBy) {
    const message = `Task ${task._id} status changed to ${status}`;

    // Emit to all users associated with the task’s device
    io.of('/ws/user').to(`device:${task.device._id}`).emit('task-update', {
        taskId: task._id,
        message,
        status,
        deviceId: task.device._id,
        updatedBy,
        timestamp: new Date()
    });

    // Emit to the specific device
    io.of('/ws/device').to(`device:${task.device._id}`).emit('task-update', {
        taskId: task._id,
        message,
        status,
        updatedBy,
        timestamp: new Date()
    });

    console.log(`Notification sent: ${message}`);
}

module.exports = { sendNotification };