require('dotenv').config();
const express = require('express');
const cors = require('cors');
const jwt = require('jsonwebtoken');
const http = require('http');
const socketIo = require('socket.io');
const helmet = require('helmet');
const morgan = require('morgan');
const multer = require('multer');
const PDFDocument = require('pdfkit');
const { v4: uuidv4 } = require('uuid');
const path = require('path');

const connectDB = require('./db');
const seedDatabase = require('./seed');
const Patient = require('./models/Patient');
const Notification = require('./models/Notification');

const app = express();
const server = http.createServer(app);

// ✅ FIXED: Improved CORS configuration
const io = socketIo(server, {
  cors: {
    origin: process.env.CORS_ORIGIN || ["https://your-frontend-domain.com", "http://localhost:3000"],
    methods: ["GET", "POST"],
    credentials: true
  }
});

const PORT = process.env.PORT || 3000;
const JWT_SECRET = process.env.JWT_SECRET || 'your-super-secret-jwt-key-change-in-production';

// ✅ IMPROVED: Better CORS configuration
app.use(helmet({
  crossOriginResourcePolicy: { policy: "cross-origin" } // Allow resources to be loaded
}));

app.use(cors({
  origin: process.env.CORS_ORIGIN || true, // Use true to reflect request origin
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization']
}));

app.use(morgan('combined'));
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));

// ✅ FIXED: Serve static files correctly
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

// ✅ Handle preflight requests
app.options('*', cors());

// ✅ Connect to MongoDB Atlas + seed data
(async () => {
  try {
    await connectDB();
    console.log('✅ MongoDB connected successfully!');
    
    // Only seed in development or if explicitly enabled
    if (process.env.NODE_ENV !== 'production' || process.env.SEED_DB === 'true') {
      await seedDatabase();
      console.log('✅ Database seeded successfully!');
    }
  } catch (err) {
    console.error('❌ MongoDB connection failed:', err);
    process.exit(1); // Exit if DB connection fails
  }
})();

// ✅ Auth middleware
const authenticateToken = (req, res, next) => {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];
  
  if (!token) {
    return res.status(401).json({ error: 'Access token required' });
  }

  jwt.verify(token, JWT_SECRET, (err, user) => {
    if (err) {
      return res.status(403).json({ error: 'Invalid or expired token' });
    }
    req.user = user;
    next();
  });
};

// ✅ Root route for Render health check
app.get('/', (req, res) => {
  res.json({ 
    message: '✅ Clear Aligner Tracker Backend is Running!',
    timestamp: new Date().toISOString(),
    version: '1.0.0'
  });
});

// ✅ FIXED: Auth route with better error handling
app.post('/api/auth/login', async (req, res) => {
  try {
    const { username, password } = req.body;
    
    // Input validation
    if (!username || !password) {
      return res.status(400).json({ error: 'Username and password are required' });
    }

    // ✅ FIXED: Use environment variables with fallbacks for development
    const adminUsername = process.env.ADMIN_USERNAME || 'admin';
    const adminPassword = process.env.ADMIN_PASSWORD || 'password123';

    console.log(`Login attempt for user: ${username}`);

    if (username === adminUsername && password === adminPassword) {
      const token = jwt.sign({ 
        user: 'Dr. Jennifer Wilson',
        username: username,
        role: 'admin'
      }, JWT_SECRET, { expiresIn: '24h' });
      
      res.json({ 
        token, 
        user: 'Dr. Jennifer Wilson',
        message: 'Login successful'
      });
    } else {
      // ✅ Security: Don't reveal which field was wrong
      res.status(401).json({ error: 'Invalid credentials' });
    }
  } catch (error) {
    console.error('Login error:', error);
    res.status(500).json({ error: 'Internal server error during login' });
  }
});

// ✅ FIXED: Patients routes with better error handling
app.get('/api/patients', authenticateToken, async (req, res) => {
  try {
    const { search, sortBy = 'name' } = req.query;
    const query = search
      ? { $or: [{ name: new RegExp(search, 'i') }, { id: new RegExp(search, 'i') }] }
      : {};
    
    const patients = await Patient.find(query).sort(sortBy);
    res.json(patients);
  } catch (error) {
    console.error('Error fetching patients:', error);
    res.status(500).json({ error: 'Failed to fetch patients' });
  }
});

app.get('/api/patients/:id', authenticateToken, async (req, res) => {
  try {
    const patient = await Patient.findOne({ id: req.params.id });
    if (patient) {
      res.json(patient);
    } else {
      res.status(404).json({ error: 'Patient not found' });
    }
  } catch (error) {
    console.error('Error fetching patient:', error);
    res.status(500).json({ error: 'Failed to fetch patient' });
  }
});

app.post('/api/patients', authenticateToken, async (req, res) => {
  try {
    // ✅ Generate unique ID if not provided
    if (!req.body.id) {
      req.body.id = `PAT-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    }

    const newPatient = new Patient(req.body);
    const saved = await newPatient.save();
    
    io.emit('patientAdded', saved);
    res.status(201).json(saved);
  } catch (err) {
    console.error('Error creating patient:', err);
    res.status(400).json({ error: 'Failed to create patient: ' + err.message });
  }
});

app.put('/api/patients/:id', authenticateToken, async (req, res) => {
  try {
    const updated = await Patient.findOneAndUpdate(
      { id: req.params.id },
      { $set: req.body },
      { new: true, runValidators: true }
    );
    
    if (updated) {
      io.emit('patientUpdated', updated);
      res.json(updated);
    } else {
      res.status(404).json({ error: 'Patient not found' });
    }
  } catch (error) {
    console.error('Error updating patient:', error);
    res.status(400).json({ error: 'Failed to update patient' });
  }
});

app.post('/api/patients/:id/progress', authenticateToken, async (req, res) => {
  try {
    const updated = await Patient.findOneAndUpdate(
      { id: req.params.id },
      { 
        $set: { 
          progress: req.body.progress, 
          compliance: req.body.compliance,
          lastUpdated: new Date()
        } 
      },
      { new: true }
    );
    
    if (updated) {
      io.emit('progressUpdated', { 
        id: updated.id, 
        progress: updated.progress, 
        compliance: updated.compliance 
      });
      res.json(updated);
    } else {
      res.status(404).json({ error: 'Patient not found' });
    }
  } catch (error) {
    console.error('Error updating progress:', error);
    res.status(400).json({ error: 'Failed to update progress' });
  }
});

// ✅ FIXED: Photo upload with better error handling
app.post('/api/patients/:id/photo', authenticateToken, upload.single('photo'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'No file uploaded' });
    }

    // Mock AI analysis
    const analysis = {
      fitScore: Math.floor(Math.random() * 20) + 80,
      improvement: Math.floor(Math.random() * 10) + 5,
      recommendation: 'Excellent fit! Continue with current aligner.',
      analyzedAt: new Date().toISOString()
    };

    res.json({ 
      ...analysis, 
      filePath: `/uploads/${req.file.filename}`,
      message: 'Photo uploaded and analyzed successfully'
    });
  } catch (error) {
    console.error('Error uploading photo:', error);
    res.status(500).json({ error: 'Failed to upload photo' });
  }
});

// ✅ Notifications with better error handling
app.get('/api/notifications', authenticateToken, async (req, res) => {
  try {
    const notes = await Notification.find().sort({ date: -1 });
    res.json(notes);
  } catch (error) {
    console.error('Error fetching notifications:', error);
    res.status(500).json({ error: 'Failed to fetch notifications' });
  }
});

app.post('/api/notifications', authenticateToken, async (req, res) => {
  try {
    const newNotif = new Notification({ 
      message: req.body.message, 
      type: req.body.type || 'info',
      date: new Date()
    });
    const saved = await newNotif.save();
    io.emit('newNotification', saved);
    res.status(201).json(saved);
  } catch (error) {
    console.error('Error creating notification:', error);
    res.status(400).json({ error: 'Failed to create notification' });
  }
});

// ✅ PDF export with error handling
app.get('/api/patients/:id/export', authenticateToken, async (req, res) => {
  try {
    const patient = await Patient.findOne({ id: req.params.id });
    if (!patient) {
      return res.status(404).json({ error: 'Patient not found' });
    }

    const doc = new PDFDocument();
    
    // Set response headers
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename=${patient.name.replace(/\s+/g, '_')}-report.pdf`);
    
    doc.pipe(res);
    
    // PDF content
    doc.fontSize(18).text('Clear Aligner Patient Report', 50, 50);
    doc.fontSize(12);
    doc.text(`Name: ${patient.name}`, 50, 100);
    doc.text(`Patient ID: ${patient.id}`, 50, 120);
    doc.text(`Progress: ${patient.progress}%`, 50, 140);
    doc.text(`Compliance: ${patient.compliance}%`, 50, 160);
    doc.text(`Eco Score: ${patient.ecoScore || 'N/A'}%`, 50, 180);
    doc.text(`Report Generated: ${new Date().toLocaleDateString()}`, 50, 200);
    
    doc.end();
  } catch (error) {
    console.error('Error generating PDF:', error);
    res.status(500).json({ error: 'Failed to generate PDF report' });
  }
});

// ✅ WebSockets with better connection handling
io.on('connection', (socket) => {
  console.log('User connected:', socket.id);
  
  socket.emit('welcome', { 
    message: 'Connected to ClearPro backend',
    connectionId: socket.id,
    timestamp: new Date().toISOString()
  });

  socket.on('disconnect', (reason) => {
    console.log('User disconnected:', socket.id, 'Reason:', reason);
  });

  socket.on('error', (error) => {
    console.error('Socket error:', error);
  });
});

// ✅ Health check with detailed info
app.get('/api/health', (req, res) => {
  res.json({ 
    status: 'OK', 
    timestamp: new Date().toISOString(),
    service: 'Clear Aligner Tracker API',
    version: '1.0.0',
    environment: process.env.NODE_ENV || 'development'
  });
});

// ✅ 404 handler for undefined routes
app.use('*', (req, res) => {
  res.status(404).json({ error: `Route ${req.originalUrl} not found` });
});

// ✅ Global error handler
app.use((err, req, res, next) => {
  console.error('Unhandled error:', err);
  res.status(500).json({ error: 'Internal server error' });
});

// ✅ Important for Render: listen on all network interfaces (0.0.0.0)
server.listen(PORT, '0.0.0.0', () => {
  console.log(`🚀 Backend running on port ${PORT}`);
  console.log(`📍 Environment: ${process.env.NODE_ENV || 'development'}`);
  console.log(`🔗 CORS Origin: ${process.env.CORS_ORIGIN || 'all origins'}`);
});

module.exports = app;
