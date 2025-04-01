const mongoose = require('mongoose');

const taskSchema = new mongoose.Schema({
  name: { type: String, required: true },
  description: { type: String },
  creator: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  device: { type: mongoose.Schema.Types.ObjectId, ref: 'Device', required: true },
  
  // Action to perform
  action: { 
    type: { type: String, enum: ['status_change', 'temperature_set', 'other'], required: true },
    value: { type: mongoose.Schema.Types.Mixed, required: true } // e.g., 'on'/'off' for status_change, or a number for temperature
  },
  
  // Execution timing
  schedule: {
    startDate: { type: Date, required: true },
    startTime: { type: String, required: true }, // Format: "HH:MM" in 24-hour format
    endDate: { type: Date }, // Optional end date for recurring tasks
    
    // Recurrence pattern
    recurrence: { 
      type: { type: String, enum: ['once', 'daily', 'weekly', 'monthly', 'custom'], default: 'once' },
      
      // For weekly recurrence - days of week (0 = Sunday, 1 = Monday, etc.)
      daysOfWeek: [{ type: Number, min: 0, max: 6 }],
      
      // For monthly recurrence
      dayOfMonth: { type: Number, min: 1, max: 31 },
      
      // For custom recurrence - cron expression (e.g., "0 9 * * 1,3,5" for Mon, Wed, Fri at 9am)
      cronExpression: { type: String },
      
      // Frequency for any recurrence type (e.g., every 2 weeks)
      interval: { type: Number, default: 1 }
    }
  },
  
  // Execution status
  status: { 
    type: String, 
    enum: ['scheduled', 'active', 'completed', 'failed', 'cancelled'], 
    default: 'scheduled' 
  },
  lastExecuted: { type: Date },
  nextExecution: { type: Date },
  
  // Execution results
  executionHistory: [{
    timestamp: { type: Date },
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
    additionalValue: { type: mongoose.Schema.Types.Mixed } // For 'between' operator
  }]
}, { timestamps: true });

// Calculate and update the next execution time
taskSchema.methods.updateNextExecution = function() {
  const now = new Date();
  const startDate = new Date(this.schedule.startDate);
  
  // For one-time tasks
  if (this.schedule.recurrence.type === 'once') {
    // If the task is in the future, set nextExecution
    const taskDateTime = new Date(startDate);
    const [hours, minutes] = this.schedule.startTime.split(':').map(Number);
    taskDateTime.setHours(hours, minutes, 0, 0);
    
    this.nextExecution = taskDateTime > now ? taskDateTime : null;
    return;
  }
  
  // For recurring tasks
  let nextDate = new Date(Math.max(startDate, now));
  
  // Set the time part from the task's startTime
  const [hours, minutes] = this.schedule.startTime.split(':').map(Number);
  nextDate.setHours(hours, minutes, 0, 0);
  
  // If today's execution time has passed, move to next occurrence
  if (nextDate <= now) {
    switch (this.schedule.recurrence.type) {
      case 'daily':
        nextDate.setDate(nextDate.getDate() + this.schedule.recurrence.interval);
        break;
        
      case 'weekly':
        // Find the next occurrence based on daysOfWeek
        if (this.schedule.recurrence.daysOfWeek && this.schedule.recurrence.daysOfWeek.length > 0) {
          const currentDay = nextDate.getDay();
          const days = [...this.schedule.recurrence.daysOfWeek].sort();
          
          // Find the next day of week
          let nextDay = days.find(day => day > currentDay);
          if (!nextDay) {
            // If no days left this week, go to first day next week
            nextDay = days[0];
            nextDate.setDate(nextDate.getDate() + (7 - currentDay + nextDay));
          } else {
            nextDate.setDate(nextDate.getDate() + (nextDay - currentDay));
          }
        } else {
          // If no specific days are set, just add the interval weeks
          nextDate.setDate(nextDate.getDate() + (7 * this.schedule.recurrence.interval));
        }
        break;
        
      case 'monthly':
        // Set to the specified day of month
        if (this.schedule.recurrence.dayOfMonth) {
          nextDate.setDate(1); // Go to first of month
          nextDate.setMonth(nextDate.getMonth() + 1); // Go to next month
          nextDate.setDate(Math.min(this.schedule.recurrence.dayOfMonth, 
                                   new Date(nextDate.getFullYear(), nextDate.getMonth() + 1, 0).getDate()));
        } else {
          // If no specific day, just add a month
          nextDate.setMonth(nextDate.getMonth() + this.schedule.recurrence.interval);
        }
        break;
        
      case 'custom':
        // For custom recurrence, we would use a cron parser library
        // This is a placeholder - in a real implementation, you would use a library like 'cron-parser'
        nextDate.setDate(nextDate.getDate() + 1);
        break;
    }
  }
  
  // Check if the next execution is after the end date (if specified)
  if (this.schedule.endDate && nextDate > new Date(this.schedule.endDate)) {
    this.nextExecution = null;
    this.status = 'completed';
  } else {
    this.nextExecution = nextDate;
  }
};

// Pre-save hook to update nextExecution
taskSchema.pre('save', function(next) {
  if (this.isNew || this.isModified('schedule')) {
    this.updateNextExecution();
  }
  next();
});

module.exports = mongoose.model('Task', taskSchema);