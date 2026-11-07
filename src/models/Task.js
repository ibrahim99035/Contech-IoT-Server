const logger = require('../config/logger');
const mongoose = require('mongoose');
const moment = require('moment-timezone');

const taskSchema = new mongoose.Schema({
  name: { type: String, required: true },
  description: { type: String },
  creator: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  device: { type: mongoose.Schema.Types.ObjectId, ref: 'Device', required: true },
  
  timezone: { type: String, required: true },
  
  action: { 
    type: { type: String, enum: ['status_change', 'temperature_set', 'other'], required: true },
    value: { type: mongoose.Schema.Types.Mixed, required: true }
  },
  
  schedule: {
    startDate: { type: Date, required: true },
    startTime: { type: String, required: true }, // Format: "HH:MM"
    endDate: { type: Date },
    
    recurrence: { 
      type: { type: String, enum: ['once', 'daily', 'weekly', 'monthly', 'custom'], default: 'once' },
      daysOfWeek: [{ type: Number, min: 0, max: 6 }],
      dayOfMonth: { type: Number, min: 1, max: 31 },
      cronExpression: { type: String },
      interval: { type: Number, default: 1 }
    }
  },
  
  status: { 
    type: String, 
    enum: ['scheduled', 'active', 'completed', 'failed', 'cancelled'], 
    default: 'scheduled' 
  },
  lastExecuted: { type: Date },
  nextExecution: { type: Date },
  
  executionHistory: [{
    timestamp: { type: Date },
    status: { type: String, enum: ['success', 'failure'] },
    message: { type: String }
  }],
  
  notifications: {
    enabled: { type: Boolean, default: false },
    recipients: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }],
    beforeExecution: { type: Number },
    onFailure: { type: Boolean, default: true }
  },
  
  conditions: [{
    type: { type: String, enum: ['sensor_value', 'time_window', 'device_status', 'user_presence'] },
    device: { type: mongoose.Schema.Types.ObjectId, ref: 'Device' },
    operator: { type: String, enum: ['equals', 'not_equals', 'greater_than', 'less_than', 'between'] },
    value: { type: mongoose.Schema.Types.Mixed },
    additionalValue: { type: mongoose.Schema.Types.Mixed }
  }]
}, { timestamps: true });

// Helper method to get current time in user's timezone
taskSchema.methods.getCurrentTimeInUserTimezone = function() {
  return moment().tz(this.timezone);
};

// Helper method to convert user's local time to UTC
taskSchema.methods.convertLocalTimeToUTC = function(localDate, localTime) {
  const userDateTime = moment.tz(localDate, this.timezone).format('YYYY-MM-DD');
  const fullDateTime = moment.tz(`${userDateTime} ${localTime}`, 'YYYY-MM-DD HH:mm', this.timezone);
  return fullDateTime.utc().toDate();
};

// FIXED: Add cron support
taskSchema.methods.getNextCronOccurrence = function(currentUserTime) {
  try {
    const { CronExpressionParser } = require('cron-parser');
    const cronExpression = this.schedule.recurrence.cronExpression;
    
    if (!cronExpression) {
      logger.error('No cron expression provided for custom task');
      return null;
    }

    // Parse cron expression in user's timezone (cron-parser v5 API).
    const interval = CronExpressionParser.parse(cronExpression, {
      currentDate: currentUserTime.toDate(),
      tz: this.timezone
    });

    const nextOccurrence = interval.next().toDate();
    
    // Convert back to moment in user timezone
    return moment.tz(nextOccurrence, this.timezone);
  } catch (error) {
    logger.error('Error parsing cron expression:', error);
    return null;
  }
};

// The first moment this schedule is allowed to run: startDate at startTime in
// the task's timezone. Every recurrence type is anchored to this instant.
taskSchema.methods.getScheduleAnchorInUserTimezone = function() {
  const anchorUtc = this.convertLocalTimeToUTC(this.schedule.startDate, this.schedule.startTime);
  return moment.tz(anchorUtc, this.timezone);
};

// Calculate the next occurrence in the user's timezone.
//
// `startDate` is a hard floor for every recurrence type: a daily task that
// starts in ten days must not run today. Once the anchor is in the past we
// advance through the recurrence from "now" until the occurrence is future.
taskSchema.methods.getNextOccurrenceInUserTimezone = function(currentUserTime) {
  const [hours, minutes] = this.schedule.startTime.split(':').map(Number);
  const recurrence = this.schedule.recurrence || {};
  const type = recurrence.type || 'once';
  const interval = Math.max(1, Number(recurrence.interval) || 1);
  const anchor = this.getScheduleAnchorInUserTimezone();

  // One-time task: only valid while its start is still in the future.
  if (type === 'once') {
    return anchor.isAfter(currentUserTime) ? anchor : null;
  }

  // Custom cron: search from just before a future anchor so an anchor that
  // matches the cron expression is returned as the first occurrence.
  if (type === 'custom') {
    const cronFrom = anchor.isAfter(currentUserTime)
      ? anchor.clone().subtract(1, 'second')
      : currentUserTime.clone();
    return this.getNextCronOccurrence(cronFrom);
  }

  // The first occurrence can never be before the anchor; when the anchor has
  // already passed, start searching from now.
  const searchFrom = moment.max(currentUserTime.clone(), anchor.clone());

  if (type === 'daily') {
    const candidate = searchFrom.clone().hours(hours).minutes(minutes).seconds(0).milliseconds(0);
    // Setting the time can move the candidate before the search window on the
    // same day (e.g. now 18:00, startTime 09:30); advance in interval steps.
    while (!candidate.isAfter(currentUserTime) || candidate.isBefore(anchor)) {
      candidate.add(interval, 'days');
      candidate.hours(hours).minutes(minutes).seconds(0).milliseconds(0);
    }
    return candidate;
  }

  if (type === 'weekly') {
    const daysOfWeek = recurrence.daysOfWeek;

    // Fixed weekly cadence (no weekday filter): count weeks from the anchor.
    if (!daysOfWeek || daysOfWeek.length === 0) {
      const candidate = anchor.clone();
      while (!candidate.isAfter(currentUserTime)) {
        candidate.add(7 * interval, 'days');
      }
      return candidate;
    }

    // Specific weekdays: first matching weekday at/after the anchor and after now.
    const allowedDays = [...new Set(daysOfWeek)].sort((a, b) => a - b);
    const candidate = searchFrom.clone().hours(hours).minutes(minutes).seconds(0).milliseconds(0);
    for (let i = 0; i < 14; i++) {
      if (candidate.isAfter(currentUserTime) && !candidate.isBefore(anchor) && allowedDays.includes(candidate.day())) {
        return candidate;
      }
      candidate.add(1, 'day');
      candidate.hours(hours).minutes(minutes).seconds(0).milliseconds(0);
    }
    return null;
  }

  if (type === 'monthly') {
    // `dayOfMonth` wins when supplied; otherwise recur on the startDate's day.
    const targetDay = recurrence.dayOfMonth || anchor.date();
    // Move a month cursor from day 1 so large intervals cannot overflow
    // (e.g. Jan 31 + 1 month must land in February, clamped to its last day).
    const cursor = anchor.clone().startOf('month').hours(hours).minutes(minutes).seconds(0).milliseconds(0);

    for (let i = 0; i < 1200; i++) {
      const candidate = cursor.clone()
        .date(Math.min(targetDay, cursor.daysInMonth()))
        .hours(hours).minutes(minutes).seconds(0).milliseconds(0);

      if (candidate.isAfter(currentUserTime) && !candidate.isBefore(anchor)) {
        return candidate;
      }
      cursor.add(interval, 'months');
    }
    return null;
  }

  // Unknown recurrence: fall back to the anchor if it is still in the future.
  return anchor.isAfter(currentUserTime) ? anchor : null;
};

taskSchema.methods.updateNextExecution = function() {
  const currentUserTime = this.getCurrentTimeInUserTimezone();
  const nextUserTime = this.getNextOccurrenceInUserTimezone(currentUserTime);

  if (!nextUserTime) {
    this.nextExecution = null;
    return;
  }

  // Check end date
  if (this.schedule.endDate) {
    const endDate = moment.tz(this.schedule.endDate, this.timezone).endOf('day');
    if (nextUserTime.isAfter(endDate)) {
      this.nextExecution = null;
      this.status = 'completed';
      return;
    }
  }

  // Convert to UTC
  this.nextExecution = nextUserTime.utc().toDate();
};

// Method to get next execution time in user's timezone (for display)
taskSchema.methods.getNextExecutionInUserTimezone = function() {
  if (!this.nextExecution) return null;
  return moment.utc(this.nextExecution).tz(this.timezone);
};

// Method to format execution time for user display
taskSchema.methods.getFormattedNextExecution = function() {
  const nextExec = this.getNextExecutionInUserTimezone();
  if (!nextExec) return null;
  
  return {
    date: nextExec.format('YYYY-MM-DD'),
    time: nextExec.format('HH:mm'),
    timezone: this.timezone,
    formatted: nextExec.format('YYYY-MM-DD HH:mm z')
  };
};

// Pre-save hook to update nextExecution
taskSchema.pre('save', function(next) {
  if (this.isNew || this.isModified('schedule') || this.isModified('timezone')) {
    this.updateNextExecution();
  }
  next();
});

// Indexes for query performance
taskSchema.index({ status: 1, nextExecution: 1 });
taskSchema.index({ creator: 1, status: 1 });
taskSchema.index({ device: 1, status: 1 });

module.exports = mongoose.model('Task', taskSchema);