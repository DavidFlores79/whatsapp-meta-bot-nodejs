const mongoose = require('mongoose');

/**
 * Ticket Model
 * Complete ticket management system with dynamic category validation
 */
const ticketSchema = new mongoose.Schema({
    ticketId: {
        type: String,
        required: true,
        unique: true,
        index: true
    },

    // Related entities
    customerId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Customer',
        required: true,
        index: true
    },
    conversationId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Conversation',
        index: true
    },
    assignedAgent: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Agent',
        index: true
    },

    // Ticket information
    subject: {
        type: String,
        required: true,
        maxlength: 200
    },
    description: {
        type: String,
        required: true
    },

    // Classification
    category: {
        type: String,
        required: true,
        index: true
        // Dynamic validation handled in service layer
    },
    subcategory: String,

    // Business Type Isolation (CRITICAL for multi-preset support)
    businessType: {
        type: String,
        required: true,
        enum: ['luxfree', 'restaurant', 'ecommerce', 'healthcare', 'custom'],
        index: true,
        default: 'luxfree'  // Safe default for migration
    },

    // Preset snapshot for audit trail
    presetSnapshot: {
        presetId: String,
        assistantName: String,
        companyName: String
    },

    // Priority and status
    priority: {
        type: String,
        enum: ['low', 'medium', 'high', 'urgent'],
        default: 'medium',
        index: true
    },
    status: {
        type: String,
        enum: ['new', 'open', 'in_progress', 'pending_customer', 'waiting_internal', 'resolved', 'closed'],
        default: 'new',
        index: true
    },

    // Status history
    statusHistory: [{
        from: String,
        to: String,
        changedBy: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'Agent'
        },
        changedAt: {
            type: Date,
            default: Date.now
        },
        reason: String
    }],

    // SLA tracking
    slaLevel: {
        type: String,
        enum: ['standard', 'priority', 'vip'],
        default: 'standard'
    },
    estimatedResolution: Date,
    firstResponseTime: Number,
    resolutionTime: Number,

    // Location information
    location: {
        latitude: Number,
        longitude: Number,
        address: String,
        formattedAddress: String,
        isServiceLocation: {
            type: Boolean,
            default: false
        }
    },

    // Attachments from conversation (images, documents, etc.)
    attachments: [{
        type: {
            type: String,
            enum: ['image', 'document', 'audio', 'video']
        },
        url: String,
        publicId: String,
        filename: String,
        mimeType: String,
        messageId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'Message'
        },
        addedAt: {
            type: Date,
            default: Date.now
        }
    }],

    // Resolution information
    resolution: {
        summary: String,
        steps: [String],
        resolvedBy: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'Agent'
        },
        resolvedAt: Date,
        resolutionCategory: {
            type: String,
            enum: ['solved', 'workaround', 'duplicate', 'invalid', 'wont_fix']
        }
    },

    // Customer feedback
    customerFeedback: {
        rating: {
            type: Number,
            min: 1,
            max: 5
        },
        comment: String,
        submittedAt: Date,
        followUpNeeded: {
            type: Boolean,
            default: false
        }
    },

    // Internal notes and communication
    notes: [{
        agent: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'Agent',
            required: false  // Allow system-generated notes without agent
        },
        content: {
            type: String,
            required: true
        },
        isInternal: {
            type: Boolean,
            default: true
        },
        timestamp: {
            type: Date,
            default: Date.now
        }
    }],

    // Tags and labels
    tags: [String],

    // Escalation
    escalated: {
        type: Boolean,
        default: false
    },
    escalatedTo: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Agent'
    },
    escalatedAt: Date,
    escalationReason: String,

    // Related tickets
    relatedTickets: [{
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Ticket'
    }],
    parentTicket: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Ticket'
    },

    // Reopening tracking
    reopenCount: {
        type: Number,
        default: 0
    },
    lastReopenedAt: Date,

    // Timestamps
    createdAt: {
        type: Date,
        default: Date.now
    },
    updatedAt: {
        type: Date,
        default: Date.now
    },
    closedAt: Date,
    lastActivityAt: {
        type: Date,
        default: Date.now
    }
});

// Indexes for performance
ticketSchema.index({ customerId: 1, createdAt: -1 });
ticketSchema.index({ assignedAgent: 1, status: 1 });
ticketSchema.index({ category: 1, status: 1 });
ticketSchema.index({ priority: 1, status: 1 });
ticketSchema.index({ status: 1, updatedAt: -1 });
ticketSchema.index({ tags: 1 });

// Business type isolation indexes (CRITICAL for cross-business prevention)
ticketSchema.index({ customerId: 1, businessType: 1 });
ticketSchema.index({ businessType: 1, status: 1 });
ticketSchema.index({ businessType: 1, category: 1 });

// Text index for search
ticketSchema.index({
    subject: 'text',
    description: 'text'
});

// Update timestamps on save
ticketSchema.pre('save', function(next) {
    this.updatedAt = new Date();
    this.lastActivityAt = new Date();
    next();
});

module.exports = mongoose.model('Ticket', ticketSchema);
