const mongoose = require('mongoose');

const messageSchema = new mongoose.Schema({
    conversationId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Conversation',
        required: true,
        index: true
    },
    customerId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Customer',
        required: true,
        index: true
    },

    // Message Content
    content: {
        type: String,
        required: true
    },
    type: {
        type: String,
        enum: ['text', 'image', 'audio', 'video', 'document', 'location', 'contact', 'template', 'interactive'],
        default: 'text',
        index: true
    },

    // Direction and Source
    direction: {
        type: String,
        enum: ['inbound', 'outbound'],
        required: true,
        index: true
    },
    sender: {
        type: String,
        enum: ['customer', 'agent', 'system', 'ai'],
        required: true
    },
    agentId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Agent'
    },

    // WhatsApp Integration
    whatsappMessageId: String,
    whatsappStatus: {
        type: String,
        enum: ['sent', 'delivered', 'read', 'failed'],
        default: 'sent'
    },
    whatsappTimestamp: Date,
    whatsappError: String,

    // Message Status
    status: {
        type: String,
        enum: ['pending', 'sent', 'delivered', 'read', 'failed'],
        default: 'pending',
        index: true
    },

    // Rich Media Content
    attachments: [{
        type: {
            type: String,
            enum: ['image', 'document', 'audio', 'video']
        },
        url: String,
        publicId: String,
        filename: String,
        mimeType: String,
        size: Number,
        thumbnailUrl: String,
        duration: Number
    }],

    // Location Data
    location: {
        latitude: Number,
        longitude: Number,
        address: String,
        name: String,
        mapImageUrl: String
    },

    // Template Message Data
    template: {
        name: String,
        language: String,
        parameters: [String],
        category: String
    },

    // Interactive Message Data
    interactive: {
        type: {
            type: String,
            enum: ['button', 'list', 'quick_reply']
        },
        buttons: [{
            id: String,
            title: String,
            payload: String
        }],
        listItems: [{
            id: String,
            title: String,
            description: String
        }]
    },

    // AI Processing
    aiProcessed: { type: Boolean, default: false },
    aiResponse: {
        confidence: Number,
        intent: String,
        entities: [String],
        sentiment: {
            type: String,
            enum: ['positive', 'neutral', 'negative']
        }
    },

    // Message Context
    replyTo: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Message'
    },
    isForwarded: { type: Boolean, default: false },
    forwardedFrom: String,

    // Timestamps
    timestamp: { type: Date, default: Date.now, index: true },
    readAt: Date,
    deliveredAt: Date
}, {
    timestamps: true
});

// Indexes
messageSchema.index({ conversationId: 1, timestamp: -1 });
messageSchema.index({ customerId: 1, timestamp: -1 });
messageSchema.index({ direction: 1, timestamp: -1 });
messageSchema.index({ status: 1 });
messageSchema.index({ whatsappMessageId: 1 });
messageSchema.index({ type: 1 });
messageSchema.index({
    content: "text"
}, {
    default_language: "spanish"
});

module.exports = mongoose.model('Message', messageSchema);
