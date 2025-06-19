const mongoose = require('mongoose');
const moment = require('moment-timezone'); // Add this dependency

const taskSchema = new mongoose.Schema({
  name: { type: String, required: true },
  description: { type: String },
  creator: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  device: { type: mongoose.Schema.Types.ObjectId, ref: 'Device', required: true },
  
  // Add timezone field
  timezone: { type: String, required: true }, // e.g., 'America/New_York', 'Europe/London'
  
  // Action to perform
  action: { 
    type: { type: String, enum: ['status_change', 'temperature_set', 'other'], required: true },
    value: { type: mongoose.Schema.Types.Mixed, required: true }
  },
  
  // Execution timing
  schedule: {
    startDate: { type: Date, required: true }, // Store in UTC, but interpret in user's timezone
    startTime: { type: String, required: true }, // Format: "HH:MM" in 24-hour format (user's local time)
    endDate: { type: Date }, // Optional end date for recurring tasks (UTC)
    
    // Recurrence pattern
    recurrence: { 
      type: { type: String, enum: ['once', 'daily', 'weekly', 'monthly', 'custom'], default: 'once' },
      daysOfWeek: [{ type: Number, min: 0, max: 6 }],
      dayOfMonth: { type: Number, min: 1, max: 31 },
      cronExpression: { type: String },
      interval: { type: Number, default: 1 }
    }
  },
  
  // Execution status
  status: { 
    type: String, 
    enum: ['scheduled', 'active', 'completed', 'failed', 'cancelled'], 
    default: 'scheduled' 
  },
  lastExecuted: { type: Date }, // UTC
  nextExecution: { type: Date }, // UTC - calculated based on user's timezone
  
  // Execution results
  executionHistory: [{
    timestamp: { type: Date }, // UTC
    status: { type: String, enum: ['success', 'failure'] },
    message: { type: String }
  }],
  
  // Notifications
  notifications: {
    enabled: { type: Boolean, default: false },
    recipients: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }],
    beforeExecution: { type: Number }, // Minutes before execution to notify
    onFailure: { type: Boolean, default: true }
  },
  
  // Task conditions (optional)
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
  // Create a moment object in the user's timezone
  const userDateTime = moment.tz(localDate, this.timezone).format('YYYY-MM-DD');
  const fullDateTime = moment.tz(`${userDateTime} ${localTime}`, 'YYYY-MM-DD HH:mm', this.timezone);
  
  // Convert to UTC
  return fullDateTime.utc().toDate();
};

// Helper method to get next occurrence in user's timezone
taskSchema.methods.getNextOccurrenceInUserTimezone = function(currentUserTime) {
  const [hours, minutes] = this.schedule.startTime.split(':').map(Number);
  let nextOccurrence = currentUserTime.clone().hours(hours).minutes(minutes).seconds(0).milliseconds(0);
  
  // If today's execution time has passed, move to next occurrence
  if (nextOccurrence.isSameOrBefore(currentUserTime)) {
    switch (this.schedule.recurrence.type) {
      case 'daily':
        nextOccurrence.add(this.schedule.recurrence.interval, 'days');
        break;
        
      case 'weekly':
        if (this.schedule.recurrence.daysOfWeek && this.schedule.recurrence.daysOfWeek.length > 0) {
          const currentDay = nextOccurrence.day(); // 0 = Sunday
          const days = [...this.schedule.recurrence.daysOfWeek].sort();
          
          // Find the next day of week
          let nextDay = days.find(day => day > currentDay);
          if (!nextDay) {
            // If no days left this week, go to first day next week
            nextDay = days[0];
            const daysToAdd = (7 - currentDay + nextDay) % 7 || 7;
            nextOccurrence.add(daysToAdd, 'days');
          } else {
            nextOccurrence.add(nextDay - currentDay, 'days');
          }
        } else {
          nextOccurrence.add(7 * this.schedule.recurrence.interval, 'days');
        }
        break;
        
      case 'monthly':
        if (this.schedule.recurrence.dayOfMonth) {
          // Move to next month and set the day
          nextOccurrence.add(this.schedule.recurrence.interval, 'months');
          nextOccurrence.date(Math.min(this.schedule.recurrence.dayOfMonth, nextOccurrence.daysInMonth()));
        } else {
          nextOccurrence.add(this.schedule.recurrence.interval, 'months');
        }
        break;
        
      case 'custom':
        // For custom recurrence, would use cron-parser
        nextOccurrence.add(1, 'day'); // Placeholder
        break;
        
      default: // 'once'
        return null;
    }
  }
  
  return nextOccurrence;
};

// Calculate and update the next execution time (timezone-aware)
taskSchema.methods.updateNextExecution = function() {
  const currentUserTime = this.getCurrentTimeInUserTimezone();
  const startDate = moment.tz(this.schedule.startDate, this.timezone);
  
  // For one-time tasks
  if (this.schedule.recurrence.type === 'once') {
    const taskDateTime = this.convertLocalTimeToUTC(this.schedule.startDate, this.schedule.startTime);
    
    // Only set nextExecution if it's in the future
    this.nextExecution = taskDateTime > new Date() ? taskDateTime : null;
    return;
  }
  
  // For recurring tasks, find the next occurrence
  const nextUserTime = this.getNextOccurrenceInUserTimezone(currentUserTime);
  
  if (!nextUserTime) {
    this.nextExecution = null;
    return;
  }
  
  // Check if the next execution is after the end date (if specified)  
  if (this.schedule.endDate) {
    const endDate = moment.tz(this.schedule.endDate, this.timezone);
    if (nextUserTime.isAfter(endDate)) {
      this.nextExecution = null;
      this.status = 'completed';
      return;
    }
  }
  
  // Convert the next execution time from user's timezone to UTC
  this.nextExecution = nextUserTime.utc().toDate();
};

// Method to get next execution time in user's timezone (for display purposes)
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

module.exports = mongoose.model('Task', taskSchema);