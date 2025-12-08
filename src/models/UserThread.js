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
  },
  lastCleanup: {
    type: Date,
    default: null
  },
  history: [{
    role: {
      type: String,
      enum: ['user', 'assistant', 'system'],
      required: true
    },
    content: {
      type: String,
      required: true
    },
    timestamp: {
      type: Date,
      default: Date.now
    },
    metadata: {
      type: Map,
      of: String
    }
  }]
}, {
  timestamps: true
});

// Update last interaction on save
userThreadSchema.pre('save', function (next) {
  this.lastInteraction = Date.now();
  next();
});

module.exports = mongoose.model('UserThread', userThreadSchema);
