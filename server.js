const mongoose = require('mongoose');

mongoose.connect(process.env.MONGODB_URI, {
  useNewUrlParser: true,
  useUnifiedTopology: true
})
.then(() => console.log('✅ Connected to MongoDB Atlas'))
.catch(err => console.error('❌ MongoDB connection error:', err));
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
const fs = require('fs');
const path = require('path');

const app = express();
const server = http.createServer(app);
const io = socketIo(server, { cors: { origin: "*" } });

const PORT = process.env.PORT || 3000;
const JWT_SECRET = 'your-secret-key'; // Replace in production

// Middleware
app.use(helmet());
app.use(cors({ origin: 'http://localhost:3000' })); // Adjust for your frontend
app.use(morgan('combined'));
app.use(express.json({ limit: '10mb' }));
app.use('/uploads', express.static('uploads')); // For photo uploads

// In-memory stores (replace with DB)
let patients = [
  { id: 'ALN-2025-001', name: 'Sarah Johnson', progress: 45, compliance: 92, startDate: '2025-03-15', endDate: '2025-10-01', ecoScore: 95 },
  { id: 'ALN-2025-002', name: 'Michael Johnson', progress: 30, compliance: 85, startDate: '2025-02-01', endDate: '2025-09-01', ecoScore: 88 },
  { id: 'ALN-2025-003', name: 'Emily Chen', progress: 60, compliance: 95, startDate: '2025-01-15', endDate: '2025-08-01', ecoScore: 98 }
];

let notifications = [
  { id: uuidv4(), message: 'Patient Sarah Johnson: Compliance score updated to 95%', type: 'info', date: new Date().toISOString() },
  { id: uuidv4(), message: 'Lab order #123: Ready for pickup', type: 'success', date: new Date().toISOString() },
  { id: uuidv4(), message: 'Virtual check-in scheduled for tomorrow', type: 'warning', date: new Date().toISOString() }
];

// Multer for file uploads
const upload = multer({ dest: 'uploads/' });

// Auth Middleware (stub)
const authenticateToken = (req, res, next) => {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];
  if (!token) return res.sendStatus(401);
  jwt.verify(token, JWT_SECRET, (err, user) => {
    if (err) return res.sendStatus(403);
    req.user = user;
    next();
  });
};

// Routes

// Auth: Login (stub for Dr. Wilson)
app.post('/api/auth/login', (req, res) => {
  const { username, password } = req.body;
  if (username === 'admin' && password === 'password') { // Demo creds
    const token = jwt.sign({ user: 'Dr. Jennifer Wilson' }, JWT_SECRET);
    res.json({ token, user: 'Dr. Jennifer Wilson' });
  } else {
    res.status(401).json({ error: 'Invalid credentials' });
  }
});

// Patients
app.get('/api/patients', authenticateToken, (req, res) => {
  // Search & Filter
  const { search, sortBy = 'name' } = req.query;
  let filtered = patients;
  if (search) {
    filtered = patients.filter(p => p.name.toLowerCase().includes(search.toLowerCase()) || p.id.includes(search));
  }
  filtered.sort((a, b) => a[sortBy] - b[sortBy]);
  res.json(filtered);
});

app.get('/api/patients/:id', authenticateToken, (req, res) => {
  const patient = patients.find(p => p.id === req.params.id);
  if (patient) res.json(patient);
  else res.status(404).json({ error: 'Patient not found' });
});

app.post('/api/patients', authenticateToken, (req, res) => {
  const newPatient = { id: `ALN-2025-${patients.length + 1}`.padStart(12, '0'), ecoScore: 90, ...req.body };
  patients.push(newPatient);
  io.emit('patientAdded', newPatient); // Real-time update
  res.status(201).json(newPatient);
});

app.put('/api/patients/:id', authenticateToken, (req, res) => {
  const index = patients.findIndex(p => p.id === req.params.id);
  if (index !== -1) {
    patients[index] = { ...patients[index], ...req.body };
    io.emit('patientUpdated', patients[index]);
    res.json(patients[index]);
  } else {
    res.status(404).json({ error: 'Patient not found' });
  }
});

// Progress Update
app.post('/api/patients/:id/progress', authenticateToken, (req, res) => {
  const patient = patients.find(p => p.id === req.params.id);
  if (patient) {
    patient.progress = req.body.progress || patient.progress;
    patient.compliance = req.body.compliance || patient.compliance;
    io.emit('progressUpdated', { id: req.params.id, progress: patient.progress, compliance: patient.compliance });
    res.json(patient);
  } else {
    res.status(404).json({ error: 'Patient not found' });
  }
});

// Photo Upload & AI Analysis (Mock)
app.post('/api/patients/:id/photo', authenticateToken, upload.single('photo'), (req, res) => {
  // Mock AI: Analyze image (in production, use TensorFlow.js or AWS Rekognition)
  const analysis = {
    fitScore: Math.floor(Math.random() * 20) + 80,
    improvement: Math.floor(Math.random() * 10) + 5,
    recommendation: 'Excellent fit! Continue with current aligner.'
  };
  res.json({ ...analysis, filePath: req.file ? `/uploads/${req.file.filename}` : null });
});

// Notifications
app.get('/api/notifications', authenticateToken, (req, res) => {
  res.json(notifications);
});

app.post('/api/notifications', authenticateToken, (req, res) => {
  const newNotif = { id: uuidv4(), ...req.body, date: new Date().toISOString() };
  notifications.push(newNotif);
  io.emit('newNotification', newNotif);
  res.status(201).json(newNotif);
});

// PDF Export
app.get('/api/patients/:id/export', authenticateToken, (req, res) => {
  const patient = patients.find(p => p.id === req.params.id);
  if (!patient) return res.status(404).json({ error: 'Patient not found' });

  const doc = new PDFDocument();
  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', `attachment; filename=${patient.name}-report.pdf`);
  doc.pipe(res);
  doc.fontSize(18).text('Patient Report', 50, 50);
  doc.text(`Name: ${patient.name}`, 50, 100);
  doc.text(`Progress: ${patient.progress}%`, 50, 120);
  doc.text(`Compliance: ${patient.compliance}%`, 50, 140);
  doc.text(`Eco Score: ${patient.ecoScore}%`, 50, 160);
  doc.end();
});

// WebSockets for Real-time
io.on('connection', (socket) => {
  console.log('User connected:', socket.id);
  socket.emit('welcome', { message: 'Connected to ClearProPro backend' });

  socket.on('joinPatient', (patientId) => {
    socket.join(patientId);
  });

  socket.on('disconnect', () => {
    console.log('User disconnected:', socket.id);
  });
});

// Health Check
app.get('/api/health', (req, res) => res.json({ status: 'OK', timestamp: new Date().toISOString() }));

server.listen(PORT, () => {
  console.log(`🚀 Clear Aligner Case Tracker Pro Backend running on http://localhost:${PORT}`);
});
