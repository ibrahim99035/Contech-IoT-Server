const TaskScheduler = require('./services/TaskScheduler');
const TaskExecutor = require('./services/TaskExecutor');
const TaskConditionChecker = require('./services/TaskConditionChecker');
const TaskNotificationService = require('./services/TaskNotificationService');
const DeviceActionHandler = require('./services/DeviceActionHandler');
const logger = require('./utils/logger');

/**
 * Initialize and start the Task Scheduler with all its services
 */
async function initializeTaskScheduler() {
  try {
    logger.info('Initializing Task Scheduler system...');
    
    // Start the main scheduler
    await TaskScheduler.start();
    
    logger.info('Task Scheduler system initialized successfully');
    
    // Return the scheduler instance for external use
    return TaskScheduler;
  } catch (error) {
    logger.error('Failed to initialize Task Scheduler system:', error);
    throw error;
  }
}

/**
 * Graceful shutdown handler
 */
async function shutdownTaskScheduler() {
  try {
    logger.info('Shutting down Task Scheduler system...');
    
    // Get scheduler status before shutdown
    const status = TaskScheduler.getSchedulerStatus();
    logger.info(`Cancelling ${status.activeJobs} active jobs`);
    
    // Cancel all active jobs
    for (const taskId of status.scheduledTasks) {
      TaskScheduler.unscheduleTask(taskId);
    }
    
    logger.info('Task Scheduler system shutdown completed');
  } catch (error) {
    logger.error('Error during Task Scheduler shutdown:', error);
  }
}

// Handle graceful shutdown
process.on('SIGINT', async () => {
  logger.info('Received SIGINT signal, initiating graceful shutdown...');
  await shutdownTaskScheduler();
  process.exit(0);
});

process.on('SIGTERM', async () => {
  logger.info('Received SIGTERM signal, initiating graceful shutdown...');
  await shutdownTaskScheduler();
  process.exit(0);
});

// Handle uncaught exceptions
process.on('uncaughtException', (error) => {
  logger.error('Uncaught Exception:', error);
  // Don't exit here, let winston handle it
});

process.on('unhandledRejection', (reason, promise) => {
  logger.error('Unhandled Rejection at:', promise, 'reason:', reason);
  // Don't exit here, let winston handle it
});

// Export the main components
module.exports = {
  // Main scheduler instance (singleton)
  scheduler: TaskScheduler,
  
  // Individual service classes for direct instantiation if needed
  TaskScheduler,
  TaskExecutor,
  TaskConditionChecker,
  TaskNotificationService,
  DeviceActionHandler,
  
  // Utility functions
  initializeTaskScheduler,
  shutdownTaskScheduler,
  
  // Logger instance
  logger
};

// If this file is run directly, initialize the scheduler
if (require.main === module) {
  initializeTaskScheduler().catch((error) => {
    logger.error('Failed to start Task Scheduler:', error);
    process.exit(1);
  });
}