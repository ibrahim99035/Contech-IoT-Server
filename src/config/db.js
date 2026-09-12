const mongoose = require('mongoose');
const dotenv = require('dotenv');

// Load environment variables from .env file
dotenv.config();

<<<<<<< Updated upstream
const connectDB = async () => {
    try {
        await mongoose.connect(process.env.MONGODB_URI, {});
        console.log("CONNECTED TO DATABASE SUCCESSFULLY");
    } catch (error) {
        console.error('COULD NOT CONNECT TO DATABASE:', error.message);
=======
  // Parse URI and add loadBalanced=false for SSH tunnel compatibility
  let finalUri = mongoUri;
  if (!mongoUri.includes('loadBalanced')) {
    finalUri = mongoUri.includes('?') 
      ? `${mongoUri}&loadBalanced=false` 
      : `${mongoUri}?loadBalanced=false`;
  }

  const mongoOptions = {
    serverSelectionTimeoutMS: 15000,
    socketTimeoutMS: 45000,
    connectTimeoutMS: 10000,
    maxPoolSize: 10,
    directConnection: mongoUri.includes('directConnection=true') ? true : undefined,
    autoIndex: true,
  };

  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      await mongoose.connect(finalUri, mongoOptions);
      logger.info('Connected to MongoDB successfully');

      mongoose.connection.on('disconnected', () => {
        logger.warn('MongoDB disconnected. Attempting reconnection...');
      });

      mongoose.connection.on('reconnected', () => {
        logger.info('MongoDB reconnected successfully');
      });

      mongoose.connection.on('error', (err) => {
        logger.error('MongoDB connection error', { error: err.message });
      });

      return;
    } catch (error) {
      logger.error(`MongoDB connection attempt ${attempt}/${retries} failed`, {
        error: error.message
      });

      if (error.message.includes('ENOTFOUND') && mongoUri.includes('@mongodb:')) {
        mongoUri = mongoUri.replace('@mongodb:', '@127.0.0.1:');
        logger.info(`Host 'mongodb' unresolved. Switching URI to 127.0.0.1...`);
      }

      if (attempt < retries) {
        logger.info(`Retrying in ${delay / 1000}s...`);
        await new Promise(resolve => setTimeout(resolve, delay));
      }
>>>>>>> Stashed changes
    }
};

module.exports = connectDB;