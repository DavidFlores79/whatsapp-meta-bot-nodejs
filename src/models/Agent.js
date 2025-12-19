const mongoose = require('mongoose');

const agentSchema = new mongoose.Schema({
    email: {
        type: String,
        required: true,
        unique: true,
        lowercase: true,
        trim: true,
        index: true
    },
    password: {
        type: String,
        required: true,
        select: false  // Don't return password by default
    },
    firstName: {
        type: String,
        required: true
    },
    lastName: {
        type: String,
        required: true
    },
    avatar: String,
    phoneNumber: {
        type: String,
        required: [true, 'Phone number is required for WhatsApp notifications'],
        trim: true
    },

    // Role & Permissions
    role: {
        type: String,
        enum: ['agent', 'supervisor', 'admin'],
        default: 'agent',
        index: true
    },
    permissions: [{
        type: String,
        enum: ['view_conversations', 'assign_conversations', 'manage_agents', 'view_analytics']
    }],

    // Status Management
    status: {
        type: String,
        enum: ['online', 'offline', 'busy', 'away'],
        default: 'offline',
        index: true
    },
    isActive: {
        type: Boolean,
        default: true
    },
    lastStatusChange: Date,
    lastActivity: Date,

    // Assignment Configuration
    maxConcurrentChats: {
        type: Number,
        default: 5,
        min: 1,
        max: 20
    },
    autoAssign: {
        type: Boolean,
        default: true
    },
    skills: [String],  // ['billing', 'technical', 'sales']
    languages: [String],  // ['es', 'en']

    // Statistics
    statistics: {
        totalAssignments: { type: Number, default: 0 },
        activeAssignments: { type: Number, default: 0 },
        totalMessages: { type: Number, default: 0 },
        averageResponseTime: { type: Number, default: 0 },
        averageResolutionTime: { type: Number, default: 0 },
        satisfactionScore: { type: Number, min: 1, max: 5 },
        totalResolutions: { type: Number, default: 0 }
    },

    // Session Management
    refreshTokens: [{
        token: String,
        createdAt: { type: Date, default: Date.now },
        expiresAt: Date,
        deviceInfo: String
    }],

    // Settings
    settings: {
        notificationsEnabled: { type: Boolean, default: true },
        soundEnabled: { type: Boolean, default: true },
        emailNotifications: { type: Boolean, default: true }
    }
}, {
    timestamps: true
});

// Indexes for performance
agentSchema.index({ status: 1, isActive: 1 });
agentSchema.index({ role: 1 });
agentSchema.index({ 'statistics.activeAssignments': 1 });

// Virtual for full name
agentSchema.virtual('fullName').get(function() {
    return `${this.firstName} ${this.lastName}`;
});

module.exports = mongoose.model('Agent', agentSchema);
