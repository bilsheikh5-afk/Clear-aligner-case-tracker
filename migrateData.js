// migrateData.js
require('dotenv').config();
const mongoose = require('mongoose');
const Patient = require('./models/Patient');
const Notification = require('./models/Notification');

// 🧩 Connect to MongoDB Atlas
mongoose.connect(process.env.MONGODB_URI, {
  useNewUrlParser: true,
  useUnifiedTopology: true,
})
.then(async () => {
  console.log('✅ Connected to MongoDB Atlas');

  // 🔁 Clear existing data (optional)
  await Patient.deleteMany({});
  await Notification.deleteMany({});

  // 🧍‍♂️ Patient Data (from your server.js memory)
  const patients = [
    { id: 'ALN-2025-001', name: 'Sarah Johnson', progress: 45, compliance: 92, startDate: '2025-03-15', endDate: '2025-10-01', ecoScore: 95 },
    { id: 'ALN-2025-002', name: 'Michael Johnson', progress: 30, compliance: 85, startDate: '2025-02-01', endDate: '2025-09-01', ecoScore: 88 },
    { id: 'ALN-2025-003', name: 'Emily Chen', progress: 60, compliance: 95, startDate: '2025-01-15', endDate: '2025-08-01', ecoScore: 98 },
  ];

  // 🔔 Notification Data
  const notifications = [
    { message: 'Patient Sarah Johnson: Compliance score updated to 95%', type: 'info', date: new Date().toISOString() },
    { message: 'Lab order #123: Ready for pickup', type: 'success', date: new Date().toISOString() },
    { message: 'Virtual check-in scheduled for tomorrow', type: 'warning', date: new Date().toISOString() },
  ];

  // 💾 Insert into MongoDB
  await Patient.insertMany(patients);
  await Notification.insertMany(notifications);

  console.log('✅ Migration successful!');
  process.exit(0);
})
.catch((err) => {
  console.error('❌ Migration failed:', err);
  process.exit(1);
});
