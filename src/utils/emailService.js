const nodemailer = require('nodemailer');

const transporter = nodemailer.createTransport({
  service: 'gmail',
  auth: {
    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_PASS,
  },
  debug: false,
  logger: false,
});

/**
 * Send an email
 * @param {Object} options
 * @param {string|string[]} options.to - Recipient(s) email address
 * @param {string} options.subject - Email subject
 * @param {string} [options.text] - Plain text body
 * @param {string} [options.html] - HTML body
 * @param {string} [options.priority] - Email priority
 * @returns {Promise}
 */
async function sendEmail(options) {
  const mailOptions = {
    from: process.env.EMAIL_USER,
    to: options.to,
    subject: options.subject,
    text: options.text,
    html: options.html,
    priority: options.priority || 'normal',
  };

  return transporter.sendMail(mailOptions);
}

module.exports = { sendEmail };