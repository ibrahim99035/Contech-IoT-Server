const winston = require('winston');
const path = require('path');

// Define log levels and colors
const logLevels = {
  error: 0,
  warn: 1,
  info: 2,
  http: 3,
  debug: 4
};

const logColors = {
  error: 'red',
  warn: 'yellow',
  info: 'green',
  http: 'magenta',
  debug: 'blue'
};

// Add colors to winston
winston.addColors(logColors);

// Create custom format
const customFormat = winston.format.combine(
  winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
  winston.format.errors({ stack: true }),
  winston.format.colorize({ all: true }),
  winston.format.printf(({ timestamp, level, message, stack, ...meta }) => {
    let log = `${timestamp} [${level}]: ${message}`;
    
    // Add stack trace for errors
    if (stack) {
      log += `\n${stack}`;
    }
    
    // Add metadata if present
    if (Object.keys(meta).length > 0) {
      log += `\n${JSON.stringify(meta, null, 2)}`;
    }
    
    return log;
  })
);

// File format without colors
const fileFormat = winston.format.combine(
  winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
  winston.format.errors({ stack: true }),
  winston.format.json()
);

// Create transports
const transports = [
  // Console transport
  new winston.transports.Console({
    level: process.env.LOG_LEVEL || 'info',
    format: customFormat
  }),
  
  // File transport for all logs
  new winston.transports.File({
    filename: path.join(process.cwd(), 'logs', 'task-scheduler.log'),
    level: 'debug',
    format: fileFormat,
    maxsize: 10 * 1024 * 1024, // 10MB
    maxFiles: 5,
    tailable: true
  }),
  
  // Separate file for errors
  new winston.transports.File({
    filename: path.join(process.cwd(), 'logs', 'task-scheduler-error.log'),
    level: 'error',
    format: fileFormat,
    maxsize: 10 * 1024 * 1024, // 10MB
    maxFiles: 3,
    tailable: true
  })
];

// Create logger instance
const logger = winston.createLogger({
  levels: logLevels,
  transports,
  exitOnError: false,
  
  // Handle uncaught exceptions
  exceptionHandlers: [
    new winston.transports.File({
      filename: path.join(process.cwd(), 'logs', 'exceptions.log'),
      format: fileFormat
    })
  ],
  
  // Handle unhandled promise rejections
  rejectionHandlers: [
    new winston.transports.File({
      filename: path.join(process.cwd(), 'logs', 'rejections.log'),
      format: fileFormat
    })
  ]
});

// Create logs directory if it doesn't exist
const fs = require('fs');
const logsDir = path.join(process.cwd(), 'logs');
if (!fs.existsSync(logsDir)) {
  fs.mkdirSync(logsDir, { recursive: true });
}

// Add task-specific logging methods
logger.taskInfo = (taskName, message, meta = {}) => {
  logger.info(`[TASK: ${taskName}] ${message}`, { task: taskName, ...meta });
};

logger.taskError = (taskName, message, error, meta = {}) => {
  logger.error(`[TASK: ${taskName}] ${message}`, { 
    task: taskName, 
    error: error instanceof Error ? error.message : error,
    stack: error instanceof Error ? error.stack : undefined,
    ...meta 
  });
};

logger.taskDebug = (taskName, message, meta = {}) => {
  logger.debug(`[TASK: ${taskName}] ${message}`, { task: taskName, ...meta });
};

logger.deviceAction = (deviceName, action, status, meta = {}) => {
  logger.info(`[DEVICE: ${deviceName}] Action: ${action} - Status: ${status}`, {
    device: deviceName,
    action,
    status,
    ...meta
  });
};

logger.conditionCheck = (taskName, conditionType, result, meta = {}) => {
  logger.debug(`[CONDITION: ${taskName}] ${conditionType} - Result: ${result ? 'MET' : 'NOT MET'}`, {
    task: taskName,
    conditionType,
    result,
    ...meta
  });
};

logger.notification = (type, recipient, status, meta = {}) => {
  logger.info(`[NOTIFICATION: ${type}] To: ${recipient} - Status: ${status}`, {
    notificationType: type,
    recipient,
    status,
    ...meta
  });
};

module.exports = logger;