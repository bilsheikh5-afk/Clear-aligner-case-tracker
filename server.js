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
const io = socketIo(server, { cors: { origin: "*" } });

const PORT = process.env.PORT || 3000;
const JWT_SECRET = process.env.JWT_SECRET || 'default-secret';

// ✅ Middleware
app.use(helmet());
app.use(cors({ origin: process.env.CORS_ORIGIN || '*' }));
app.use(morgan('combined'));
app.use(express.json({ limit: '10mb' }));

// ✅ File uploads setup
const upload = multer({ dest: path.join(__dirname, 'uploads') });
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

// ✅ Connect to MongoDB Atlas + seed data
(async () => {
  try {
    await connectDB();
    await seedDatabase();
    console.log('✅ MongoDB connected & seeded successfully!');
  } catch (err) {
    console.error('❌ MongoDB connection failed:', err);
  }
})();

// ✅ Auth middleware
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

// ✅ Root route for Render health check
app.get('/', (req, res) => {
  res.send('✅ Clear Aligner Tracker Backend is Running!');
});

// ✅ Auth route
app.post('/api/auth/login', (req, res) => {
  const { username, password } = req.body;
  if (username === process.env.ADMIN_USERNAME && password === process.env.ADMIN_PASSWORD) {
    const token = jwt.sign({ user: 'Dr. Jennifer Wilson' }, JWT_SECRET);
    res.json({ token, user: 'Dr. Jennifer Wilson' });
  } else {
    res.status(401).json({ error: 'Invalid credentials' });
  }
});

// ✅ Patients routes
app.get('/api/patients', authenticateToken, async (req, res) => {
  const { search, sortBy = 'name' } = req.query;
  const query = search
    ? { $or: [{ name: new RegExp(search, 'i') }, { id: new RegExp(search, 'i') }] }
    : {};
  const patients = await Patient.find(query).sort(sortBy);
  res.json(patients);
});

app.get('/api/patients/:id', authenticateToken, async (req, res) => {
  const patient = await Patient.findOne({ id: req.params.id });
  if (patient) res.json(patient);
  else res.status(404).json({ error: 'Patient not found' });
});

app.post('/api/patients', authenticateToken, async (req, res) => {
  try {
    const newPatient = new Patient(req.body);
    const saved = await newPatient.save();
    io.emit('patientAdded', saved);
    res.status(201).json(saved);
  } catch (err) {
    res.status(400).json({ error: 'Failed to create patient' });
  }
});

app.put('/api/patients/:id', authenticateToken, async (req, res) => {
  const updated = await Patient.findOneAndUpdate(
    { id: req.params.id },
    { $set: req.body },
    { new: true }
  );
  if (updated) {
    io.emit('patientUpdated', updated);
    res.json(updated);
  } else res.status(404).json({ error: 'Patient not found' });
});

app.post('/api/patients/:id/progress', authenticateToken, async (req, res) => {
  const updated = await Patient.findOneAndUpdate(
    { id: req.params.id },
    { $set: { progress: req.body.progress, compliance: req.body.compliance } },
    { new: true }
  );
  if (updated) {
    io.emit('progressUpdated', { id: updated.id, progress: updated.progress, compliance: updated.compliance });
    res.json(updated);
  } else res.status(404).json({ error: 'Patient not found' });
});

// ✅ Photo upload + AI mock
app.post('/api/patients/:id/photo', authenticateToken, upload.single('photo'), async (req, res) => {
  const analysis = {
    fitScore: Math.floor(Math.random() * 20) + 80,
    improvement: Math.floor(Math.random() * 10) + 5,
    recommendation: 'Excellent fit! Continue with current aligner.',
  };
  res.json({ ...analysis, filePath: req.file ? `/uploads/${req.file.filename}` : null });
});

// ✅ Notifications
app.get('/api/notifications', authenticateToken, async (req, res) => {
  const notes = await Notification.find().sort({ date: -1 });
  res.json(notes);
});

app.post('/api/notifications', authenticateToken, async (req, res) => {
  const newNotif = new Notification({ message: req.body.message, type: req.body.type });
  const saved = await newNotif.save();
  io.emit('newNotification', saved);
  res.status(201).json(saved);
});

// ✅ PDF export
app.get('/api/patients/:id/export', authenticateToken, async (req, res) => {
  const patient = await Patient.findOne({ id: req.params.id });
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

// ✅ WebSockets
io.on('connection', (socket) => {
  console.log('User connected:', socket.id);
  socket.emit('welcome', { message: 'Connected to ClearPro backend' });
  socket.on('disconnect', () => console.log('User disconnected:', socket.id));
});

// ✅ Health check
app.get('/api/health', (req, res) => res.json({ status: 'OK', timestamp: new Date().toISOString() }));

// ✅ Important for Render: listen on all network interfaces (0.0.0.0)
server.listen(PORT, '0.0.0.0', () => {
  console.log(`🚀 Backend running on port ${PORT}`);
});
