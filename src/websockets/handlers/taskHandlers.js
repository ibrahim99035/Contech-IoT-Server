const taskEvents = require('../taskEventEmitter');
const mqttBroker = require('../../mqtt/mqtt-broker');

function registerTaskHandlers(io) {
  taskEvents.on('task-executed', async (taskData) => {
    try {
      console.log(`Task executed: ${taskData.name}`);

      // Broadcast update to the device
      io.of('/ws/device').to(`device:${taskData.device._id}`).emit('task-update', {
        taskId: taskData._id,
        device: taskData.device._id,
        status: 'executed',
        message: `Task "${taskData.name}" was executed.`,
        action: taskData.action // Include action details
      });

      // Broadcast update to the user
      io.of('/ws/user').to(`user:${taskData.creator._id}`).emit('task-update', {
        taskId: taskData._id,
        user: taskData.creator._id,
        status: 'executed',
        message: `Your task "${taskData.name}" has been executed.`,
        device: taskData.device,
        action: taskData.action
      });

      // Publish task execution to MQTT
      try {
        const mqttBroker = require('../../mqtt/mqtt-broker');
        if (mqttBroker.client && mqttBroker.client.connected) {
          mqttBroker.client.publish(
            `home-automation/${taskData.device._id}/task`,
            JSON.stringify({
              taskId: taskData._id,
              status: 'executed',
              message: `Task "${taskData.name}" was executed.`,
              timestamp: new Date(),
              device: taskData.device._id,
              creator: taskData.creator._id,
              action: taskData.action
            }),
            { qos: 1 }
          );
          console.log(`Task execution published to MQTT for device ${taskData.device._id}`);
        }
      } catch (mqttError) {
        console.error('Error publishing task execution to MQTT:', mqttError);
      }

    } catch (error) {
      console.error('Error broadcasting task execution:', error);
    }
  });

  taskEvents.on('task-failed', async (taskData) => {
    try {
      console.log(`Task failed: ${taskData.name} - ${taskData.message}`);

      // Broadcast failure to the device
      io.of('/ws/device').to(`device:${taskData.device._id}`).emit('task-update', {
        taskId: taskData.taskId,
        device: taskData.device._id,
        status: 'failed',
        message: taskData.message,
      });

      // Broadcast failure to the user
      io.of('/ws/user').to(`user:${taskData.creator._id}`).emit('task-update', {
        taskId: taskData.taskId,
        user: taskData.creator._id,
        status: 'failed',
        message: taskData.message,
        device: taskData.device
      });

      // Publish task failure to MQTT
      try {
        const mqttBroker = require('../../mqtt/mqtt-broker');
        if (mqttBroker.client && mqttBroker.client.connected) {
          mqttBroker.client.publish(
            `home-automation/${taskData.device._id}/task`,
            JSON.stringify({
              taskId: taskData.taskId,
              status: 'failed',
              message: taskData.message,
              timestamp: new Date(),
              device: taskData.device._id,
              creator: taskData.creator._id
            }),
            { qos: 1 }
          );
          console.log(`Task failure published to MQTT for device ${taskData.device._id}`);
        }
      } catch (mqttError) {
        console.error('Error publishing task failure to MQTT:', mqttError);
      }

    } catch (error) {
      console.error('Error broadcasting task failure:', error);
    }
  });
}

module.exports = { registerTaskHandlers };