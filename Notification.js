const mongoose = require('mongoose');

const notificationSchema = new mongoose.Schema({
  message: { type: String, required: true },
  type: {
    type: String,
    enum: ['info', 'success', 'warning', 'error'],
    default: 'info',
  },
  date: { type: Date, default: Date.now },
});

notificationSchema.index({ date: -1 });

module.exports = mongoose.model('Notification', notificationSchema);
