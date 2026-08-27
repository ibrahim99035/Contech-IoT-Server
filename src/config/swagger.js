/**
 * Swagger OpenAPI Documentation Configuration
 * Contech IoT Smart Home Automation Server
 */

'use strict';

const swaggerUi = require('swagger-ui-express');
const swaggerJsdoc = require('swagger-jsdoc');

const options = {
  definition: {
    openapi: '3.0.0',
    info: {
      title: 'Contech IoT Smart Home API',
      version: '1.0.0',
      description: 'Production REST API for Contech IoT Smart Home Automation & Device Management',
      contact: {
        name: 'Contech IoT Support',
        email: 'support@contech.com'
      }
    },
    servers: [
      {
        url: 'http://localhost:5000',
        description: 'Local Development Server'
      }
    ],
    components: {
      securitySchemes: {
        bearerAuth: {
          type: 'http',
          scheme: 'bearer',
          bearerFormat: 'JWT',
          description: 'Enter your JWT token in the format: Bearer <token>'
        }
      },
      schemas: {
        ErrorResponse: {
          type: 'object',
          properties: {
            success: { type: 'boolean', example: false },
            message: { type: 'string', example: 'Error description' },
            code: { type: 'string', example: 'UNAUTHORIZED' }
          }
        },
        User: {
          type: 'object',
          properties: {
            _id: { type: 'string', example: '650000000000000000000001' },
            name: { type: 'string', example: 'John Doe' },
            email: { type: 'string', example: 'john@example.com' },
            role: { type: 'string', example: 'user', enum: ['admin', 'user'] },
            active: { type: 'boolean', example: true },
            emailVerified: { type: 'boolean', example: true }
          }
        },
        Apartment: {
          type: 'object',
          properties: {
            _id: { type: 'string', example: '650000000000000000000002' },
            name: { type: 'string', example: 'Main Residency' },
            address: { type: 'string', example: '123 Smart St, Cairo' },
            creator: { type: 'string', example: '650000000000000000000001' }
          }
        },
        Room: {
          type: 'object',
          properties: {
            _id: { type: 'string', example: '650000000000000000000003' },
            name: { type: 'string', example: 'Living Room' },
            apartment: { type: 'string', example: '650000000000000000000002' },
            esp_component_connected: { type: 'boolean', example: false }
          }
        },
        Device: {
          type: 'object',
          properties: {
            _id: { type: 'string', example: '650000000000000000000004' },
            name: { type: 'string', example: 'Ceiling Light' },
            type: { type: 'string', example: 'light', enum: ['light', 'switch', 'thermostat', 'sensor', 'fan', 'ac', 'curtain', 'lock', 'camera', 'other'] },
            status: { type: 'string', example: 'off', enum: ['on', 'off'] },
            order: { type: 'integer', example: 1 },
            isOnline: { type: 'boolean', example: true },
            room: { type: 'string', example: '650000000000000000000003' }
          }
        },
        Task: {
          type: 'object',
          properties: {
            _id: { type: 'string', example: '650000000000000000000005' },
            name: { type: 'string', example: 'Turn Off Lights at Midnight' },
            device: { type: 'string', example: '650000000000000000000004' },
            status: { type: 'string', example: 'active', enum: ['active', 'paused', 'completed', 'failed'] },
            nextExecution: { type: 'string', format: 'date-time' },
            timezone: { type: 'string', example: 'Africa/Cairo' }
          }
        }
      }
    },
    security: [
      {
        bearerAuth: []
      }
    ]
  },
  apis: ['./src/routes/*.js', './src/adminRoutes/*.js', './src/config/swagger.js']
};

const swaggerSpec = swaggerJsdoc(options);

/**
 * Setup Swagger UI and JSON spec endpoints on Express app
 * @param {import('express').Application} app
 */
function setupSwagger(app) {
  // Serve Swagger UI
  app.use('/api-docs', swaggerUi.serve, swaggerUi.setup(swaggerSpec, {
    customCss: '.swagger-ui .topbar { display: none }',
    customSiteTitle: 'Contech IoT — API Documentation'
  }));

  // Raw OpenAPI spec in JSON
  app.get('/api-docs/json', (req, res) => {
    res.setHeader('Content-Type', 'application/json');
    res.send(swaggerSpec);
  });
}

module.exports = setupSwagger;
