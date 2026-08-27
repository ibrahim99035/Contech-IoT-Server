/**
 * JWT Token Generator
 * @module utils/generateToken
 */

const jwt = require('jsonwebtoken');

/**
 * Generate a signed JWT for a user.
 * @param {string} userId - MongoDB user ID
 * @returns {string} Signed JWT token
 */
const generateToken = (userId) => {
  return jwt.sign({ id: userId }, process.env.JWT_SECRET, {
    expiresIn: process.env.JWT_EXPIRES_IN || '30d',
  });
};

module.exports = generateToken;