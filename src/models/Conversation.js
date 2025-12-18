const mongoose = require('mongoose');

const conversationSchema = new mongoose.Schema({
    customerId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Customer',
        required: true,
        index: true
    },

    // Assignment
    assignedAgent: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Agent',
        index: true
    },
    assignedAt: Date,
    assignedBy: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Agent'
    },

    // Status Management
    status: {
        type: String,
        enum: ['open', 'assigned', 'waiting', 'resolved', 'closed'],
        default: 'open',
        index: true
    },
    priority: {
        type: String,
        enum: ['low', 'medium', 'high', 'urgent'],
        default: 'medium',
        index: true
    },

    // Categorization
    category: {
        type: String,
        enum: ['support', 'sales', 'billing', 'technical', 'complaint', 'other'],
        default: 'support'
    },
    tags: [String],

    // AI and Automation
    isAIEnabled: { type: Boolean, default: true },
    aiModel: { type: String, default: 'gpt-4o-mini' },
    autoResponses: { type: Boolean, default: true },

    // Conversation Metadata
    channel: {
        type: String,
        enum: ['whatsapp', 'web', 'mobile_app'],
        default: 'whatsapp'
    },
    source: String,

    // Message Statistics
    messageCount: { type: Number, default: 0 },
    unreadCount: { type: Number, default: 0 },
    lastMessage: {
        content: String,
        timestamp: Date,
        from: {
            type: String,
            enum: ['customer', 'agent', 'system']
        },
        type: {
            type: String,
            enum: ['text', 'image', 'location', 'document', 'template']
        }
    },

    // Response Time Tracking
    firstResponseTime: Number,
    averageResponseTime: Number,
    lastAgentResponse: Date,
    lastCustomerMessage: Date,

    // SLA Tracking
    sla: {
        firstResponseAt: Date,
        firstResponseTarget: Number,      // Target in ms
        firstResponseMet: Boolean,        // Did we meet the target?
        resolutionTarget: Number,          // Target in ms
        resolutionMet: Boolean,            // Did we meet the target?
        breachAlertSent: { type: Boolean, default: false }
    },

    // Priority Escalation History
    priorityHistory: [{
        from: {
            type: String,
            enum: ['low', 'medium', 'high', 'urgent']
        },
        to: {
            type: String,
            enum: ['low', 'medium', 'high', 'urgent']
        },
        reason: String,
        timestamp: { type: Date, default: Date.now },
        triggeredBy: {
            type: String,
            enum: ['system', 'agent', 'keyword', 'wait_time', 'vip', 'reassignment']
        }
    }],

    // Reassignment tracking
    reassignmentCount: { type: Number, default: 0 },

    // Resolution
    resolvedAt: Date,
    resolvedBy: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Agent'
    },
    resolutionNotes: String,
    resolutionConfirmationSent: { type: Boolean, default: false },
    resolutionConfirmedAt: Date,
    resolutionConfirmedBy: {
        type: String,
        enum: ['customer', 'agent', 'system']
    },
    customerSatisfaction: {
        rating: { type: Number, min: 1, max: 5 },
        comment: String,
        submittedAt: Date
    },

    // Internal Notes
    internalNotes: [{
        agent: { type: mongoose.Schema.Types.ObjectId, ref: 'Agent' },
        content: String,
        timestamp: { type: Date, default: Date.now },
        isVisible: { type: Boolean, default: false }
    }],

    // Integration Data
    whatsappData: {
        phoneNumberId: String,
        businessAccountId: String
    },

    closedAt: Date
}, {
    timestamps: true
});

// Indexes
conversationSchema.index({ assignedAgent: 1 });
conversationSchema.index({ status: 1 });
conversationSchema.index({ priority: 1 });
conversationSchema.index({ category: 1 });
conversationSchema.index({ tags: 1 });
conversationSchema.index({ status: 1, assignedAgent: 1 });
// Performance index for Reports sort query
conversationSchema.index({ lastCustomerMessage: -1 });
conversationSchema.index({ status: 1, lastCustomerMessage: -1 });

module.exports = mongoose.model('Conversation', conversationSchema);
