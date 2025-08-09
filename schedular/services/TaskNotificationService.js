const Task = require('../../models/Task');
const moment = require('moment-timezone');
const logger = require('../utils/logger');

class TaskNotificationService {
  constructor() {
    this.notificationChannels = new Map([
      ['email', this._sendEmail.bind(this)],
      ['sms', this._sendSMS.bind(this)],
      ['push', this._sendPushNotification.bind(this)],
      ['webhook', this._sendWebhook.bind(this)]
    ]);
  }

  // Send a notification about a task (timezone-aware)
  async sendNotification(taskId, type, errorMessage = null) {
    try {
      const task = await this._getTaskWithPopulatedRefs(taskId);
      
      if (!this._shouldSendNotification(task)) {
        return;
      }
      
      const recipients = this._getRecipients(task);
      const notificationData = this._buildNotificationData(task, type, errorMessage);
      
      await this._sendToAllChannels(recipients, notificationData, task.notifications.channels);
      
    } catch (error) {
      logger.error(`Error sending notification for task ${taskId}:`, error);
    }
  }

  async _getTaskWithPopulatedRefs(taskId) {
    return await Task.findById(taskId)
      .populate('creator')
      .populate('device')
      .populate('notifications.recipients');
  }

  _shouldSendNotification(task) {
    if (!task) {
      logger.warn('Task not found for notification');
      return false;
    }
    
    if (!task.notifications || !task.notifications.enabled) {
      logger.debug(`Notifications disabled for task: ${task.name}`);
      return false;
    }
    
    return true;
  }

  _getRecipients(task) {
    return task.notifications.recipients.length > 0 
      ? task.notifications.recipients 
      : [task.creator];
  }

  _buildNotificationData(task, type, errorMessage) {
    const formattedTime = task.getFormattedNextExecution();
    const currentTime = moment().tz(task.timezone).format('YYYY-MM-DD HH:mm z');
    
    const notificationTemplates = {
      upcoming: {
        subject: `Upcoming Task: ${task.name}`,
        message: `Your task "${task.name}" for device "${task.device.name}" will be executed at ${formattedTime?.formatted || 'scheduled time'} (in ${task.notifications.beforeExecution} minutes).`,
        priority: 'normal'
      },
      success: {
        subject: `Task Executed Successfully: ${task.name}`,
        message: `Your task "${task.name}" for device "${task.device.name}" was executed successfully at ${currentTime}.`,
        priority: 'low'
      },
      failure: {
        subject: `Task Execution Failed: ${task.name}`,
        message: `Your task "${task.name}" for device "${task.device.name}" failed to execute at ${currentTime}. Error: ${errorMessage || 'Unknown error'}`,
        priority: 'high'
      }
    };
    
    return {
      ...notificationTemplates[type],
      task: {
        id: task._id.toString(),
        name: task.name,
        device: task.device.name
      },
      timestamp: new Date(),
      type
    };
  }

  async _sendToAllChannels(recipients, notificationData, enabledChannels = ['email']) {
    const promises = [];
    
    for (const channel of enabledChannels) {
      const handler = this.notificationChannels.get(channel);
      
      if (handler) {
        promises.push(this._sendToChannel(handler, recipients, notificationData, channel));
      } else {
        logger.warn(`Unknown notification channel: ${channel}`);
      }
    }
    
    await Promise.allSettled(promises);
  }

  async _sendToChannel(handler, recipients, notificationData, channelName) {
    try {
      await handler(recipients, notificationData);
      logger.info(`${channelName} notification sent for task "${notificationData.task.name}" to ${recipients.length} recipients`);
    } catch (error) {
      logger.error(`Failed to send ${channelName} notification:`, error);
    }
  }

  async _sendEmail(recipients, notificationData) {
    const emailService = require('../utils/emailService'); 
    const emails = recipients.map(user => user.email).filter(email => email);
    
    if (emails.length === 0) {
      logger.warn('No valid email addresses found for recipients');
      return;
    }
    
    const emailData = {
      to: emails,
      subject: notificationData.subject,
      html: this._generateEmailHTML(notificationData),
      text: notificationData.message,
      priority: notificationData.priority
    };
    
    await emailService.sendEmail(emailData);
    logger.debug(`Email sent to: ${emails.join(', ')}`);
  }

  async _sendSMS(recipients, notificationData) {
    const smsService = require('../utils/smsService'); // Assuming you have an SMS service
    const phoneNumbers = recipients
      .map(user => user.phoneNumber)
      .filter(phone => phone);
    
    if (phoneNumbers.length === 0) {
      logger.warn('No valid phone numbers found for recipients');
      return;
    }
    
    for (const phoneNumber of phoneNumbers) {
      await smsService.sendSMS({
        to: phoneNumber,
        message: `${notificationData.subject}\n\n${notificationData.message}`,
        priority: notificationData.priority
      });
    }
    
    logger.debug(`SMS sent to: ${phoneNumbers.join(', ')}`);
  }

  async _sendPushNotification(recipients, notificationData) {
    const pushService = require('../utils/pushService'); // Assuming you have a push service
    const deviceTokens = recipients
      .flatMap(user => user.deviceTokens || [])
      .filter(token => token);
    
    if (deviceTokens.length === 0) {
      logger.warn('No valid device tokens found for recipients');
      return;
    }
    
    await pushService.sendPush({
      tokens: deviceTokens,
      title: notificationData.subject,
      body: notificationData.message,
      data: {
        taskId: notificationData.task.id,
        type: notificationData.type,
        timestamp: notificationData.timestamp
      },
      priority: notificationData.priority
    });
    
    logger.debug(`Push notification sent to ${deviceTokens.length} devices`);
  }

  async _sendWebhook(recipients, notificationData) {
    const webhookService = require('../utils/webhookService'); // Assuming you have a webhook service
    const webhookUrls = recipients
      .flatMap(user => user.webhookUrls || [])
      .filter(url => url);
    
    if (webhookUrls.length === 0) {
      logger.warn('No valid webhook URLs found for recipients');
      return;
    }
    
    const payload = {
      event: 'task_notification',
      data: notificationData,
      timestamp: notificationData.timestamp
    };
    
    for (const url of webhookUrls) {
      await webhookService.sendWebhook(url, payload);
    }
    
    logger.debug(`Webhook sent to: ${webhookUrls.join(', ')}`);
  }

  _generateEmailHTML(notificationData) {
    const statusColor = notificationData.type === 'success' ? '#28a745' : 
                       notificationData.type === 'failure' ? '#dc3545' : '#007bff';
    
    return `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <div style="background-color: ${statusColor}; color: white; padding: 20px; text-align: center;">
          <h1 style="margin: 0;">${notificationData.subject}</h1>
        </div>
        <div style="padding: 20px; background-color: #f8f9fa;">
          <p style="font-size: 16px; line-height: 1.5;">${notificationData.message}</p>
          <div style="margin-top: 20px; padding: 15px; background-color: white; border-radius: 5px;">
            <h3 style="margin-top: 0;">Task Details:</h3>
            <ul style="list-style: none; padding: 0;">
              <li><strong>Task Name:</strong> ${notificationData.task.name}</li>
              <li><strong>Device:</strong> ${notificationData.task.device}</li>
              <li><strong>Status:</strong> ${notificationData.type.toUpperCase()}</li>
              <li><strong>Time:</strong> ${notificationData.timestamp.toLocaleString()}</li>
            </ul>
          </div>
        </div>
        <div style="padding: 10px; text-align: center; color: #6c757d; font-size: 12px;">
          <p>This is an automated message from your Smart Home Task Scheduler.</p>
        </div>
      </div>
    `;
  }

  // Method to register custom notification channels
  registerNotificationChannel(channelName, handler) {
    this.notificationChannels.set(channelName, handler);
    logger.info(`Registered custom notification channel: ${channelName}`);
  }

  // Method to get all registered channels
  getRegisteredChannels() {
    return Array.from(this.notificationChannels.keys());
  }

  // Method to test notification sending
  async testNotification(taskId, channelName = 'email') {
    try {
      const task = await this._getTaskWithPopulatedRefs(taskId);
      
      if (!task) {
        throw new Error('Task not found');
      }
      
      const testNotification = {
        subject: `Test Notification: ${task.name}`,
        message: `This is a test notification for task "${task.name}" on device "${task.device.name}".`,
        task: {
          id: task._id.toString(),
          name: task.name,
          device: task.device.name
        },
        timestamp: new Date(),
        type: 'test',
        priority: 'normal'
      };
      
      const recipients = this._getRecipients(task);
      const handler = this.notificationChannels.get(channelName);
      
      if (!handler) {
        throw new Error(`Unknown notification channel: ${channelName}`);
      }
      
      await this._sendToChannel(handler, recipients, testNotification, channelName);
      
      return { success: true, message: `Test notification sent via ${channelName}` };
    } catch (error) {
      logger.error(`Error sending test notification:`, error);
      return { success: false, message: error.message };
    }
  }
}

module.exports = TaskNotificationService;