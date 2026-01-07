// Import dependencies
require('dotenv').config();
const express = require('express');
const cors = require('cors');
const mongoose = require('mongoose');
const http = require('http');
const { startWebSocketServer } = require('./sockets/websocketState');

// Initialize app
const app = express();
const server = http.createServer(app);
const PORT = process.env.PORT || 5000;

// Middleware
app.use(cors({ origin: '*' }));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Database Connection
const connectDB = async () => {
  try {
    const conn = await mongoose.connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/nairobi_zoezi_school');
    console.log(`💾 MongoDB Connected: ${conn.connection.host}`);
  } catch (error) {
    console.error(`Error connecting to database: ${error.message}`);
    process.exit(1);
  }
};

// Connect to database
connectDB();

// Use routes
app.use('/applications', require('./routes/applicationRoutes'));
app.use('/admissions', require('./routes/admissionsRoutes'));
app.use('/students', require('./routes/studentRoutes'));
app.use('/alumni', require('./routes/alumniRoutes'));
app.use('/mpesa', require('./routes/mpesa'));
app.use('/tutors', require('./routes/tutorRoutes'));
app.use('/courses', require('./routes/courseRoutes'));
app.use('/auth', require('./routes/auth'));
app.use('/users', require('./routes/userRoutes'));
app.use('/groups', require('./routes/groupRoutes'));
app.use('/group-curriculum', require('./routes/groupCurriculumRoutes'));
app.use('/curriculums', require('./routes/curriculumRoutes'));
app.use('/student-curriculum', require('./routes/studentCurriculumRoutes'));
app.use('/certification', require('./routes/certificationRoutes'));
app.use('/admin', require('./routes/adminRoutes'));
app.use('/finance', require('./routes/financeRoutes'));
app.use('/subscription', require('./routes/subscriptionRoutes'));
app.use('/cpd', require('./routes/cpdRoutes'));

// Basic health check route
app.get('/api/health', (req, res) => {
  res.status(200).json({
    status: 'success',
    message: 'Server is running',
    timestamp: new Date().toISOString()
  });
});

// Admin Authentication Route
app.post('/api/admin/auth', (req, res) => {
  try {
    const { username, password } = req.body;
    
    // Get credentials from environment variables
    const ADMIN_USERS = process.env.ADMIN_USERS || "";
    const ADMIN_PASSWORDS = process.env.ADMIN_PASSWORDS || "";
    
    if (!ADMIN_USERS || !ADMIN_PASSWORDS) {
      return res.status(500).json({
        status: 'error',
        message: 'Admin authentication not configured'
      });
    }

    if (!username || !password) {
      return res.status(400).json({
        status: 'error',
        message: 'Username and password are required'
      });
    }

    // Parse comma-separated lists from .env
    const validUsers = ADMIN_USERS.split(',').map(u => u.trim());
    const validPasswords = ADMIN_PASSWORDS.split(',').map(p => p.trim());
    
    // Check if username exists and get its index
    const userIndex = validUsers.indexOf(username);
    
    if (userIndex === -1 || password !== validPasswords[userIndex]) {
      return res.status(401).json({
        status: 'error',
        message: 'Invalid username or password'
      });
    }

    const expiryTime = 24 * 60 * 60 * 1000; // 24 hours in milliseconds
    const expiryDate = new Date(Date.now() + expiryTime);

    res.status(200).json({
      status: 'success',
      message: 'Authentication successful',
      data: {
        authenticated: true,
        username: username,
        expiresAt: expiryDate.toISOString()
      }
    });
  } catch (error) {
    console.error('Admin auth error:', error);
    res.status(500).json({
      status: 'error',
      message: 'Authentication failed'
    });
  }
});

// Admin authentication check endpoint
app.get('/api/admin/check-auth', (req, res) => {
  try {
    // This endpoint just confirms the server is running and admin auth is available
    res.status(200).json({
      status: 'success',
      message: 'Admin auth service available',
      requiresAuth: true
    });
  } catch (error) {
    res.status(500).json({
      status: 'error',
      message: 'Auth service unavailable'
    });
  }
});

// 404 Handler
app.use((req, res) => {
  res.status(404).json({
    status: 'error',
    message: 'Route not found'
  });
});

// Error handling middleware
app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(500).json({
    status: 'error',
    message: 'Internal server error',
    error: process.env.NODE_ENV === 'development' ? err.message : {}
  });
});

// Start WebSocket server
const { clients } = startWebSocketServer(server);

// Start server
server.listen(PORT, () => {
  console.log(`🚀 Nairobi Zoezi School Server running on port ${PORT}`);
});
