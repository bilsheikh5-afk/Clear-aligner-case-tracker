const mongoose = require('mongoose');

const patientSchema = new mongoose.Schema({
  id: { type: String, required: true, unique: true },
  name: { type: String, required: true },
  progress: { type: Number, default: 0, min: 0, max: 100 },
  compliance: { type: Number, default: 0, min: 0, max: 100 },
  ecoScore: { type: Number, default: 0, min: 0, max: 100 },
  startDate: { type: Date },
  endDate: { type: Date },
  createdAt: { type: Date, default: Date.now },
});

patientSchema.index({ id: 1, name: 1 });

module.exports = mongoose.model('Patient', patientSchema);
