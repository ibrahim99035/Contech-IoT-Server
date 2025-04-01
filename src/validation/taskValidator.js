const Joi = require('joi');
const mongoose = require('mongoose');

const taskSchema = Joi.object({
    name: Joi.string().min(3).max(100).required(),
    description: Joi.string().allow('', null),
    device: Joi.string().custom((value, helpers) => {
        if (!mongoose.Types.ObjectId.isValid(value)) return helpers.error('any.invalid');
        return value;
    }, 'ObjectId validation').required(),
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
                then: Joi.required()
            }),
            dayOfMonth: Joi.number().integer().min(1).max(31).when('type', {
                is: 'monthly',
                then: Joi.required()
            }),
            cronExpression: Joi.string().when('type', {
                is: 'custom',
                then: Joi.required()
            }),
            interval: Joi.number().integer().min(1).default(1)
        }).allow(null)
    }).required(),
    notifications: Joi.object({
        enabled: Joi.boolean().default(false),
        recipients: Joi.array().items(Joi.string().custom((value, helpers) => {
            if (!mongoose.Types.ObjectId.isValid(value)) return helpers.error('any.invalid');
            return value;
        }, 'ObjectId validation')).allow(null),
        beforeExecution: Joi.number().integer().min(1).allow(null),
        onFailure: Joi.boolean().default(true)
    }).allow(null),
    conditions: Joi.array().items(Joi.object({
        type: Joi.string().valid('sensor_value', 'time_window', 'device_status', 'user_presence').required(),
        device: Joi.string().custom((value, helpers) => {
            if (!mongoose.Types.ObjectId.isValid(value)) return helpers.error('any.invalid');
            return value;
        }, 'ObjectId validation').allow(null),
        operator: Joi.string().valid('equals', 'not_equals', 'greater_than', 'less_than', 'between').required(),
        value: Joi.alternatives().try(Joi.string(), Joi.number()).required(),
        additionalValue: Joi.alternatives().try(Joi.string(), Joi.number()).allow(null)
    })).allow(null)
});

module.exports = taskSchema;