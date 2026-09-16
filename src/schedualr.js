/**
 * Task Scheduler Export Wrapper
 * Re-exports the production BullMQ Task Scheduler Service for backward compatibility.
 * @module schedualr
 */

const schedulerService = require('./services/schedulerService');

module.exports = schedulerService;