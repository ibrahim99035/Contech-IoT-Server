const Joi = require('joi');
const mongoose = require('mongoose');
const moment = require('moment-timezone');

const taskSchema = Joi.object({
    name: Joi.string().min(3).max(100).required(),
    description: Joi.string().allow('', null),
    device: Joi.string().custom((value, helpers) => {
        if (!mongoose.Types.ObjectId.isValid(value)) return helpers.error('any.invalid');
        return value;
    }, 'ObjectId validation').required(),
    
    // Add timezone validation
    timezone: Joi.string().custom((value, helpers) => {
        if (!moment.tz.zone(value)) {
            return helpers.error('any.invalid', { message: 'Invalid timezone' });
        }
        return value;
    }, 'Timezone validation').default('UTC'),
    
    action: Joi.object({
        type: Joi.string().valid('status_change', 'temperature_set', 'other').required(),
        value: Joi.alternatives().try(Joi.string(), Joi.number()).required()
    }).required(),
    
    schedule: Joi.object({
        startDate: Joi.date().iso().required(),
        startTime: Joi.string().pattern(/^([01]\d|2[0-3]):([0-5]\d)$/).required(), // 24-hour format HH:MM
        endDate: Joi.date().iso().greater(Joi.ref('startDate')).allow(null),
        recurrence: Joi.object({
            type: Joi.string().valid('once', 'daily', 'weekly', 'monthly', 'custom').default('once'),
            daysOfWeek: Joi.array().items(Joi.number().integer().min(0).max(6)).when('type', {
                is: 'weekly',
                then: Joi.required(),
                otherwise: Joi.forbidden()
            }),
            dayOfMonth: Joi.number().integer().min(1).max(31).when('type', {
                is: 'monthly',
                then: Joi.required(),
                otherwise: Joi.forbidden()
            }),
            cronExpression: Joi.string().when('type', {
                is: 'custom',
                then: Joi.required(),
                otherwise: Joi.forbidden()
            }),
            interval: Joi.number().integer().min(1).default(1)
        }).default({ type: 'once', interval: 1 })
    }).required(),
    
    notifications: Joi.object({
        enabled: Joi.boolean().default(false),
        recipients: Joi.array().items(Joi.string().custom((value, helpers) => {
            if (!mongoose.Types.ObjectId.isValid(value)) return helpers.error('any.invalid');
            return value;
        }, 'ObjectId validation')).default([]),
        beforeExecution: Joi.number().integer().min(1).allow(null),
        onFailure: Joi.boolean().default(true)
    }).default({ enabled: false, onFailure: true, recipients: [] }),
    
    conditions: Joi.array().items(Joi.object({
        type: Joi.string().valid('sensor_value', 'time_window', 'device_status', 'user_presence').required(),
        device: Joi.string().custom((value, helpers) => {
            if (!mongoose.Types.ObjectId.isValid(value)) return helpers.error('any.invalid');
            return value;
        }, 'ObjectId validation').when('type', {
            is: Joi.valid('sensor_value', 'device_status'),
            then: Joi.required(),
            otherwise: Joi.allow(null)
        }),
        operator: Joi.string().valid('equals', 'not_equals', 'greater_than', 'less_than', 'between').required(),
        value: Joi.alternatives().try(Joi.string(), Joi.number()).required(),
        additionalValue: Joi.alternatives().try(Joi.string(), Joi.number()).when('operator', {
            is: 'between',
            then: Joi.required(),
            otherwise: Joi.allow(null)
        })
    })).default([])
}).custom((value, helpers) => {
    // Custom validation to ensure startDate + startTime is in the future
    const { startDate, startTime } = value.schedule;
    const timezone = value.timezone || 'UTC';
    
    try {
        // Create a moment object in the user's timezone
        const scheduledDateTime = moment.tz(`${moment(startDate).format('YYYY-MM-DD')} ${startTime}`, 'YYYY-MM-DD HH:mm', timezone);
        const now = moment().tz(timezone);
        
        if (scheduledDateTime.isSameOrBefore(now)) {
            return helpers.error('any.custom', { 
                message: 'Scheduled date and time must be in the future in the specified timezone' 
            });
        }
    } catch (error) {
        return helpers.error('any.custom', { 
            message: 'Invalid date/time combination' 
        });
    }
    
    return value;
});

module.exports = taskSchema;