/**
 * Centralized Email Service
 * Single shared Nodemailer transporter instance.
 * All controllers should use this instead of creating their own transporters.
 * @module utils/emailService
 */

const nodemailer = require('nodemailer');
const logger = require('../config/logger');

let transporter = null;

/**
 * Get or create the shared email transporter.
 * Lazily initialized to avoid errors when EMAIL_USER/EMAIL_PASS are not set.
 * @returns {Object} Nodemailer transporter
 */
function getTransporter() {
  if (transporter) return transporter;

  if (!process.env.EMAIL_USER || !process.env.EMAIL_PASS) {
    logger.warn('Email service not configured: EMAIL_USER or EMAIL_PASS missing');
    return null;
  }

  transporter = nodemailer.createTransport({
    service: 'gmail',
    auth: {
      user: process.env.EMAIL_USER,
      pass: process.env.EMAIL_PASS,
    },
    pool: true,       // Use connection pooling
    maxConnections: 5, // Limit concurrent connections
    maxMessages: 100,  // Messages per connection before reconnecting
  });

  // Verify transporter configuration
  transporter.verify()
    .then(() => logger.info('Email transporter verified successfully'))
    .catch((err) => logger.error('Email transporter verification failed', { error: err.message }));

  return transporter;
}

/**
 * Send an email using the shared transporter.
 * @param {Object} options
 * @param {string|string[]} options.to - Recipient(s) email address
 * @param {string} options.subject - Email subject
 * @param {string} [options.text] - Plain text body
 * @param {string} [options.html] - HTML body
 * @param {string} [options.priority] - Email priority
 * @returns {Promise}
 */
async function sendEmail(options) {
  const transport = getTransporter();

  if (!transport) {
    throw new Error('Email service is not configured');
  }

  const mailOptions = {
    from: `"Contech IoT" <${process.env.EMAIL_USER}>`,
    to: options.to,
    subject: options.subject,
    text: options.text,
    html: options.html,
    priority: options.priority || 'normal',
  };

  try {
    const result = await transport.sendMail(mailOptions);
    logger.info('Email sent successfully', { to: options.to, subject: options.subject });
    return result;
  } catch (error) {
    logger.error('Failed to send email', { to: options.to, error: error.message });
    throw error;
  }
}

module.exports = { sendEmail, getTransporter };