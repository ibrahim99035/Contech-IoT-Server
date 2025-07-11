const express = require('express');

// Load environment variables
const dotenv = require('dotenv');
dotenv.config();

const morgan = require('morgan');
const cors = require('cors');
const http = require('http');  
const socketIo = require('socket.io'); 

const connectDB = require('./src/config/db');

const { errorHandler } = require('./src/middleware/errorHandler');
const { logger } = require('./src/middleware/logger'); 
const { notFound } = require('./src/middleware/notFound');

const TaskScheduler = require('./src/schedualr');

// Import Routes
const authRoutes = require('./src/routes/authRoutes');
const userRoutes = require('./src/routes/userRoutes');
const apartmentRoutes = require('./src/routes/apartmentRoutes');
const roomRoutes = require('./src/routes/roomRoutes');
const deviceRoutes = require('./src/routes/deviceRoutes');
const taskRoutes = require('./src/routes/taskRoutes');
const imageRoutes = require('./src/routes/imageRoutes'); 
const googleAssistantRoutes = require('./src/routes/googleAssistantRoutes');

// Passport configuration
const passport = require('./src/config/passport');

// Connect to database
connectDB();

// Initialize Express app
const app = express();

// Create HTTP server
const server = http.createServer(app);

// Initialize Socket.io
const io = socketIo(server, {
  cors: {
    origin: '*',  // Allow all domains for now; you can restrict later
    methods: ['GET', 'POST']
  }
});

// WebSocket logic for user and IoT device
require('./src/websockets')(io);  

// Start Task Scheduler after DB connection is established
TaskScheduler.start();

// Middleware
app.use(logger); 
app.use(express.json({ limit: '50mb' })); 
app.use(cors()); 
app.use(morgan('dev')); 

// Initialize Passport for authentication
app.use(passport.initialize());

// Routes
app.use('/api/auth', authRoutes);
app.use('/api/admin-dashboard', userRoutes); 
app.use('/api/apartments-handler', apartmentRoutes); 
app.use('/api/rooms-handler', roomRoutes); 
app.use('/api/device-handler', deviceRoutes); 
app.use('/api/task-handler', taskRoutes); 
app.use('/api/images', imageRoutes); 
app.use('/api/google-assistant', googleAssistantRoutes);

// Health Check
app.get('/health', (req, res) => {
  res.status(200).json({
    status: 'OK',
    timestamp: new Date(),
    uptime: process.uptime(),
    version: process.env.npm_package_version || '1.0.0'
  });
});

// Error Handling Middleware
app.use(notFound);
app.use(errorHandler);

// Server listener
const PORT = process.env.PORT || 5000;
server.listen(PORT, () => {
    console.log(`Server running in ${process.env.NODE_ENV} mode on port ${PORT}`);
});