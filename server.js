const express = require('express');
const dotenv = require('dotenv');
const morgan = require('morgan');
const cors = require('cors');

const http = require('http');  
const socketIo = require('socket.io'); 

const connectDB = require('./src/config/db');

const { errorHandler } = require('./src/middleware/errorHandler');
const { logger } = require('./src/middleware/logger'); 
const { notFound } = require('./src/middleware/notFound');

// Import Routes
const authRoutes = require('./src/routes/authRoutes');
const userRoutes = require('./src/routes/userRoutes');
const apartmentRoutes = require('./src/routes/apartmentRoutes');
const roomRoutes = require('./src/routes/roomRoutes');
const deviceRoutes = require('./src/routes/deviceRoutes');
const taskRoutes = require('./src/routes/taskRoutes');
// Load environment variables
dotenv.config();

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
require('./src/controllers/websocket/websockets')(io);  

// Middleware
app.use(logger); 
app.use(express.json({ limit: '50mb' })); 
app.use(cors()); 
app.use(morgan('dev')); 

// Routes
app.use('/api/auth', authRoutes);
app.use('/api/admin-dashboard', userRoutes); 
app.use('/api/apartments-handler', apartmentRoutes); 
app.use('/api/rooms-handler', roomRoutes); 
app.use('/api/device-handler', deviceRoutes); 
app.use('/api/task-handler', taskRoutes); 

// Error Handling Middleware
app.use(notFound);
app.use(errorHandler);

// Server listener
const PORT = process.env.PORT || 5000;
app.listen(PORT, () => {
    console.log(`Server running in ${process.env.NODE_ENV} mode on port ${PORT}`);
});