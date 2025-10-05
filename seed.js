const Patient = require('./models/Patient');
const Notification = require('./models/Notification');

async function seedDatabase() {
  const patientCount = await Patient.countDocuments();
  const notifCount = await Notification.countDocuments();

  if (patientCount === 0 && notifCount === 0) {
    console.log('🌱 Seeding MongoDB Atlas with initial data...');

    const patients = [
      { id: 'ALN-2025-001', name: 'Sarah Johnson', progress: 45, compliance: 92, startDate: '2025-03-15', endDate: '2025-10-01', ecoScore: 95 },
      { id: 'ALN-2025-002', name: 'Michael Johnson', progress: 30, compliance: 85, startDate: '2025-02-01', endDate: '2025-09-01', ecoScore: 88 },
      { id: 'ALN-2025-003', name: 'Emily Chen', progress: 60, compliance: 95, startDate: '2025-01-15', endDate: '2025-08-01', ecoScore: 98 },
    ];

    const notifications = [
      { message: 'Patient Sarah Johnson: Compliance score updated to 95%', type: 'info' },
      { message: 'Lab order #123: Ready for pickup', type: 'success' },
      { message: 'Virtual check-in scheduled for tomorrow', type: 'warning' },
    ];

    await Patient.insertMany(patients);
    await Notification.insertMany(notifications);

    console.log('✅ Database seeded successfully!');
  } else {
    console.log('ℹ️ Existing data detected. Skipping seeding.');
  }
}

module.exports = seedDatabase;
