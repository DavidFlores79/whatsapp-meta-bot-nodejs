const mongoose = require('mongoose');

const customerSchema = new mongoose.Schema({
    phoneNumber: {
        type: String,
        required: true,
        unique: true,
        index: true
    },
    firstName: String,
    lastName: String,
    email: {
        type: String,
        lowercase: true
    },
    avatar: String,

    // Contact Information
    alternativePhones: [String],
    address: {
        street: String,
        city: String,
        state: String,
        country: { type: String, default: 'México' },
        postalCode: String,
        coordinates: {
            latitude: Number,
            longitude: Number
        }
    },

    // Customer Segmentation
    tags: [String],
    segment: {
        type: String,
        enum: ['vip', 'regular', 'new', 'inactive'],
        default: 'new'
    },
    source: {
        type: String,
        enum: ['whatsapp', 'referral', 'website', 'social_media', 'other'],
        default: 'whatsapp'
    },

    // Custom fields
    customFields: {
        type: Map,
        of: String
    },

    // Behavioral Data
    preferences: {
        language: { type: String, default: 'es' },
        communicationHours: {
            start: { type: String, default: '09:00' },
            end: { type: String, default: '18:00' }
        },
        preferredAgent: { type: mongoose.Schema.Types.ObjectId, ref: 'Agent' }
    },

    // Status and Notes
    status: {
        type: String,
        enum: ['active', 'inactive', 'blocked', 'vip'],
        default: 'active'
    },
    isBlocked: { type: Boolean, default: false },
    blockReason: String,
    notes: String,

    // Statistics
    statistics: {
        totalConversations: { type: Number, default: 0 },
        totalMessages: { type: Number, default: 0 },
        totalTickets: { type: Number, default: 0 },
        averageResponseTime: { type: Number, default: 0 },
        satisfactionScore: { type: Number, min: 1, max: 5 }
    },

    // Timestamps
    firstContact: Date,
    lastInteraction: Date,
    lastMessageAt: Date
}, {
    timestamps: true
});

// Indexes
customerSchema.index({ email: 1 });
customerSchema.index({ tags: 1 });
customerSchema.index({ segment: 1 });
customerSchema.index({ status: 1 });
customerSchema.index({ lastInteraction: -1 });
customerSchema.index({
    firstName: "text",
    lastName: "text",
    phoneNumber: "text",
    email: "text"
});

module.exports = mongoose.model('Customer', customerSchema);
