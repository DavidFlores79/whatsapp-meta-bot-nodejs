const mongoose = require('mongoose');

const userThreadSchema = new mongoose.Schema({
  userId: {
    type: String,
    required: true,
    unique: true,
    index: true
  },
  threadId: {
    type: String,
    required: true
  },
  lastInteraction: {
    type: Date,
    default: Date.now
  },
  messageCount: {
    type: Number,
    default: 1
  }
}, {
  timestamps: true
});

// Update last interaction on save
userThreadSchema.pre('save', function(next) {
  this.lastInteraction = Date.now();
  next();
});

module.exports = mongoose.model('UserThread', userThreadSchema);
