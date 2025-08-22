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

// FIXED: Improved next occurrence calculation
taskSchema.methods.getNextOccurrenceInUserTimezone = function(currentUserTime, isInitialScheduling = false) {
  const [hours, minutes] = this.schedule.startTime.split(':').map(Number);
  let nextOccurrence = currentUserTime.clone().hours(hours).minutes(minutes).seconds(0).milliseconds(0);
  
  // For one-time tasks
  if (this.schedule.recurrence.type === 'once') {
    const startDate = moment.tz(this.schedule.startDate, this.timezone).startOf('day');
    const taskDate = startDate.clone().hours(hours).minutes(minutes);
    
    // If it's in the future, return it
    if (taskDate.isAfter(currentUserTime)) {
      return taskDate;
    }
    return null;
  }
  
  // For recurring tasks, check if today's time has already passed
  const todayAtScheduledTime = currentUserTime.clone().hours(hours).minutes(minutes).seconds(0).milliseconds(0);
  const needsToMoveToNext = todayAtScheduledTime.isSameOrBefore(currentUserTime) && !isInitialScheduling;
  
  // If today's execution time hasn't passed and this is initial scheduling, use today
  if (!needsToMoveToNext && isInitialScheduling) {
    // Check if today matches the recurrence pattern
    if (this.matchesRecurrencePattern(todayAtScheduledTime)) {
      return todayAtScheduledTime;
    }
  }
  
  // Move to next occurrence based on recurrence type
  switch (this.schedule.recurrence.type) {
    case 'daily':
      if (needsToMoveToNext) {
        nextOccurrence.add(this.schedule.recurrence.interval || 1, 'days');
      }
      break;
      
    case 'weekly':
      nextOccurrence = this.getNextWeeklyOccurrence(currentUserTime, needsToMoveToNext);
      break;
      
    case 'monthly':
      nextOccurrence = this.getNextMonthlyOccurrence(currentUserTime, needsToMoveToNext);
      break;
      
    case 'custom':
      // Implement cron parsing here
      nextOccurrence.add(1, 'day'); // Placeholder
      break;
  }
  
  return nextOccurrence;
};

// FIXED: Better weekly occurrence calculation
taskSchema.methods.getNextWeeklyOccurrence = function(currentUserTime, needsToMoveToNext) {
  const [hours, minutes] = this.schedule.startTime.split(':').map(Number);
  const daysOfWeek = this.schedule.recurrence.daysOfWeek;
  
  // If no specific days are set, use weekly interval from current day
  if (!daysOfWeek || daysOfWeek.length === 0) {
    let nextOccurrence = currentUserTime.clone().hours(hours).minutes(minutes).seconds(0).milliseconds(0);
    if (needsToMoveToNext) {
      nextOccurrence.add(7 * (this.schedule.recurrence.interval || 1), 'days');
    }
    return nextOccurrence;
  }
  
  const sortedDays = [...daysOfWeek].sort();
  const currentDay = currentUserTime.day(); // 0 = Sunday
  const currentTime = currentUserTime.clone().hours(hours).minutes(minutes).seconds(0).milliseconds(0);
  
  // Find next day of week
  let nextDay = sortedDays.find(day => {
    if (day > currentDay) return true;
    if (day === currentDay && !needsToMoveToNext) return true;
    return false;
  });
  
  if (nextDay !== undefined) {
    // Found a day this week
    const daysToAdd = nextDay - currentDay;
    return currentTime.add(daysToAdd, 'days');
  } else {
    // Move to next week, first day
    const firstDay = sortedDays[0];
    const daysUntilNextWeek = (7 - currentDay + firstDay) % 7 || 7;
    return currentTime.add(daysUntilNextWeek, 'days');
  }
};

// FIXED: Better monthly occurrence calculation
taskSchema.methods.getNextMonthlyOccurrence = function(currentUserTime, needsToMoveToNext) {
  const [hours, minutes] = this.schedule.startTime.split(':').map(Number);
  const targetDay = this.schedule.recurrence.dayOfMonth;
  
  let nextOccurrence = currentUserTime.clone().hours(hours).minutes(minutes).seconds(0).milliseconds(0);
  
  if (targetDay) {
    // Set to specific day of month
    const currentDay = currentUserTime.date();
    
    if (targetDay > currentDay || (targetDay === currentDay && !needsToMoveToNext)) {
      // This month
      nextOccurrence.date(Math.min(targetDay, nextOccurrence.daysInMonth()));
    } else {
      // Next month
      nextOccurrence.add(this.schedule.recurrence.interval || 1, 'months');
      nextOccurrence.date(Math.min(targetDay, nextOccurrence.daysInMonth()));
    }
  } else {
    // Same day of month as start date
    if (needsToMoveToNext) {
      nextOccurrence.add(this.schedule.recurrence.interval || 1, 'months');
    }
  }
  
  return nextOccurrence;
};

// Helper method to check if a date matches the recurrence pattern
taskSchema.methods.matchesRecurrencePattern = function(dateToCheck) {
  switch (this.schedule.recurrence.type) {
    case 'daily':
      return true;
      
    case 'weekly':
      const daysOfWeek = this.schedule.recurrence.daysOfWeek;
      if (!daysOfWeek || daysOfWeek.length === 0) return true;
      return daysOfWeek.includes(dateToCheck.day());
      
    case 'monthly':
      const targetDay = this.schedule.recurrence.dayOfMonth;
      if (!targetDay) return true;
      return dateToCheck.date() === targetDay;
      
    default:
      return true;
  }
};

// FIXED: Updated main calculation method
taskSchema.methods.updateNextExecution = function() {
  const currentUserTime = this.getCurrentTimeInUserTimezone();
  
  console.log(`Updating next execution for task: ${this.name}`);
  console.log(`Current user time: ${currentUserTime.format('YYYY-MM-DD HH:mm:ss z')}`);
  console.log(`Schedule type: ${this.schedule.recurrence.type}`);
  console.log(`Schedule time: ${this.schedule.startTime}`);
  
  // For one-time tasks
  if (this.schedule.recurrence.type === 'once') {
    const taskDateTime = this.convertLocalTimeToUTC(this.schedule.startDate, this.schedule.startTime);
    console.log(`One-time task datetime (UTC): ${moment.utc(taskDateTime).format('YYYY-MM-DD HH:mm:ss')} UTC`);
    
    this.nextExecution = taskDateTime > new Date() ? taskDateTime : null;
    if (this.nextExecution) {
      console.log(`Next execution set to: ${moment.utc(this.nextExecution).format('YYYY-MM-DD HH:mm:ss')} UTC`);
    } else {
      console.log('One-time task is in the past, no next execution');
    }
    return;
  }
  
  // For recurring tasks
  const isInitialScheduling = !this.lastExecuted && this.isNew;
  const nextUserTime = this.getNextOccurrenceInUserTimezone(currentUserTime, isInitialScheduling);
  
  if (!nextUserTime) {
    console.log('No next occurrence found');
    this.nextExecution = null;
    return;
  }
  
  console.log(`Next occurrence in user timezone: ${nextUserTime.format('YYYY-MM-DD HH:mm:ss z')}`);
  
  // Check end date
  if (this.schedule.endDate) {
    const endDate = moment.tz(this.schedule.endDate, this.timezone).endOf('day');
    if (nextUserTime.isAfter(endDate)) {
      console.log('Next occurrence is after end date, marking as completed');
      this.nextExecution = null;
      this.status = 'completed';
      return;
    }
  }
  
  // Convert to UTC
  this.nextExecution = nextUserTime.utc().toDate();
  console.log(`Next execution set to: ${moment.utc(this.nextExecution).format('YYYY-MM-DD HH:mm:ss')} UTC`);
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
    console.log(`Pre-save hook triggered for task: ${this.name}, isNew: ${this.isNew}`);
    this.updateNextExecution();
  }
  next();
});

module.exports = mongoose.model('Task', taskSchema);