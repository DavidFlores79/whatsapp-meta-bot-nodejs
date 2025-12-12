const mongoose = require('mongoose');

const templateSchema = new mongoose.Schema({
    // WhatsApp Template Metadata
    name: {
        type: String,
        required: true,
        unique: true,
        index: true
    },
    status: {
        type: String,
        enum: ['APPROVED', 'PENDING', 'REJECTED', 'DISABLED'],
        default: 'PENDING',
        index: true
    },
    category: {
        type: String,
        enum: ['MARKETING', 'UTILITY', 'AUTHENTICATION'],
        required: true
    },
    language: {
        type: String,
        required: true,
        default: 'es_MX'
    },

    // Template Components
    components: [{
        type: {
            type: String,
            enum: ['HEADER', 'BODY', 'FOOTER', 'BUTTONS']
        },
        format: {
            type: String,
            enum: ['TEXT', 'IMAGE', 'VIDEO', 'DOCUMENT', 'LOCATION']
        },
        text: String,
        example: {
            header_handle: [String],
            body_text: [[String]]
        },
        buttons: [{
            type: {
                type: String,
                enum: ['QUICK_REPLY', 'PHONE_NUMBER', 'URL']
            },
            text: String,
            url: String,
            phone_number: String,
            example: [String]
        }]
    }],

    // Template Variables
    parameters: [{
        name: String,
        type: {
            type: String,
            enum: ['text', 'currency', 'date_time']
        },
        position: Number,
        component: {
            type: String,
            enum: ['HEADER', 'BODY']
        }
    }],

    // Meta WhatsApp Data
    whatsappTemplateId: {
        type: String,
        unique: true,
        sparse: true
    },
    namespace: String,
    rejectionReason: String,

    // CRM Metadata
    description: String,
    tags: [String],
    usageCount: {
        type: Number,
        default: 0
    },
    lastUsedAt: Date,
    isActive: {
        type: Boolean,
        default: true,
        index: true
    },

    // Timestamps
    createdAt: {
        type: Date,
        default: Date.now
    },
    updatedAt: {
        type: Date,
        default: Date.now
    },
    lastSyncedAt: Date
}, {
    timestamps: true
});

// Indexes for efficient queries
templateSchema.index({ status: 1, isActive: 1 });
templateSchema.index({ category: 1 });
templateSchema.index({ language: 1 });
templateSchema.index({ tags: 1 });
templateSchema.index({ createdAt: -1 });
templateSchema.index({ usageCount: -1 });

// Update usageCount and lastUsedAt when template is used
templateSchema.methods.incrementUsage = async function() {
    this.usageCount += 1;
    this.lastUsedAt = new Date();
    return this.save();
};

module.exports = mongoose.model('Template', templateSchema);
