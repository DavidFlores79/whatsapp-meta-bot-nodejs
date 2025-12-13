const mongoose = require('mongoose');

/**
 * CRM Settings Model
 * Stores configurable settings for conversation management, SLA, timeouts, and automation
 */
const crmSettingsSchema = new mongoose.Schema({
    // Singleton pattern - only one settings document
    _id: {
        type: String,
        default: 'crm_settings'
    },

    // Auto-timeout configuration (in milliseconds)
    autoTimeout: {
        open: {
            type: Number,
            default: 48 * 60 * 60 * 1000,  // 48 hours - AI handling
            description: 'Timeout for conversations in open status'
        },
        assigned: {
            type: Number,
            default: 24 * 60 * 60 * 1000,  // 24 hours - agent assigned
            description: 'Timeout for conversations assigned to agent'
        },
        waiting: {
            type: Number,
            default: 12 * 60 * 60 * 1000,  // 12 hours - waiting for customer
            description: 'Timeout for conversations waiting for customer response'
        },
        resolved: {
            type: Number,
            default: 4 * 60 * 60 * 1000,   // 4 hours - waiting confirmation
            description: 'Timeout for resolved conversations waiting confirmation'
        }
    },

    // SLA (Service Level Agreement) targets
    sla: {
        firstResponseTime: {
            type: Number,
            default: 5 * 60 * 1000,        // 5 minutes
            description: 'Target time for first agent response (ms)'
        },
        resolutionTime: {
            type: Number,
            default: 24 * 60 * 60 * 1000,  // 24 hours
            description: 'Target time for conversation resolution (ms)'
        },
        enableAlerts: {
            type: Boolean,
            default: true,
            description: 'Send alerts when SLA is breached'
        }
    },

    // Priority escalation rules
    priorityEscalation: {
        enabled: {
            type: Boolean,
            default: true
        },
        waitTimeThreshold: {
            type: Number,
            default: 30 * 60 * 1000,  // 30 minutes
            description: 'Auto-escalate to high if waiting longer than this'
        },
        urgentKeywords: {
            type: [String],
            default: ['urgente', 'urgent', 'emergencia', 'emergency', 'problema grave', 'no funciona'],
            description: 'Keywords that trigger urgent priority'
        },
        highKeywords: {
            type: [String],
            default: ['importante', 'important', 'problema', 'issue', 'ayuda', 'help'],
            description: 'Keywords that trigger high priority'
        },
        vipAutoEscalate: {
            type: Boolean,
            default: true,
            description: 'Auto-escalate VIP customer conversations to high priority'
        },
        reassignmentThreshold: {
            type: Number,
            default: 2,
            description: 'Number of reassignments before escalating to urgent'
        }
    },

    // Resolution confirmation
    resolutionConfirmation: {
        enabled: {
            type: Boolean,
            default: true,
            description: 'Send confirmation message when agent marks as resolved'
        },
        messageTemplate: {
            type: String,
            default: '¿Tu problema ha sido resuelto satisfactoriamente?',
            description: 'Message to send for confirmation'
        },
        autoCloseOnConfirm: {
            type: Boolean,
            default: true,
            description: 'Auto-close conversation when customer confirms resolution'
        },
        autoCloseTimeout: {
            type: Number,
            default: 4 * 60 * 60 * 1000,  // 4 hours
            description: 'Auto-close after this time if no response to confirmation'
        }
    },

    // Agent assignment rules
    agentAssignment: {
        autoAssignEnabled: {
            type: Boolean,
            default: true,
            description: 'Enable automatic agent assignment'
        },
        roundRobin: {
            type: Boolean,
            default: true,
            description: 'Use round-robin assignment strategy'
        },
        considerWorkload: {
            type: Boolean,
            default: true,
            description: 'Consider agent workload when assigning'
        },
        maxActiveConversations: {
            type: Number,
            default: 10,
            description: 'Maximum active conversations per agent'
        },
        preferSameAgent: {
            type: Boolean,
            default: true,
            description: 'Prefer assigning to same agent for returning customers'
        }
    },

    // AI behavior
    aiBehavior: {
        autoHandoffToAgent: {
            type: Boolean,
            default: true,
            description: 'AI can suggest agent handoff'
        },
        handoffKeywords: {
            type: [String],
            default: ['hablar con agente', 'talk to agent', 'persona real', 'real person', 'representante'],
            description: 'Keywords that trigger agent handoff suggestion'
        },
        maxAIMessages: {
            type: Number,
            default: 10,
            description: 'Max AI messages before suggesting agent (0 = unlimited)'
        }
    },

    // Notification settings
    notifications: {
        notifyOnNewConversation: {
            type: Boolean,
            default: true
        },
        notifyOnSLABreach: {
            type: Boolean,
            default: true
        },
        notifyOnEscalation: {
            type: Boolean,
            default: true
        },
        notifyOnCustomerReturn: {
            type: Boolean,
            default: true,
            description: 'Notify when customer responds after being marked resolved'
        }
    },

    // Business hours
    businessHours: {
        enabled: {
            type: Boolean,
            default: false,
            description: 'Enable business hours restrictions'
        },
        timezone: {
            type: String,
            default: 'America/Mexico_City'
        },
        schedule: {
            monday: { 
                start: { type: String, default: '09:00' }, 
                end: { type: String, default: '18:00' }, 
                enabled: { type: Boolean, default: true }
            },
            tuesday: { 
                start: { type: String, default: '09:00' }, 
                end: { type: String, default: '18:00' }, 
                enabled: { type: Boolean, default: true }
            },
            wednesday: { 
                start: { type: String, default: '09:00' }, 
                end: { type: String, default: '18:00' }, 
                enabled: { type: Boolean, default: true }
            },
            thursday: { 
                start: { type: String, default: '09:00' }, 
                end: { type: String, default: '18:00' }, 
                enabled: { type: Boolean, default: true }
            },
            friday: { 
                start: { type: String, default: '09:00' }, 
                end: { type: String, default: '18:00' }, 
                enabled: { type: Boolean, default: true }
            },
            saturday: { 
                start: { type: String, default: '09:00' }, 
                end: { type: String, default: '14:00' }, 
                enabled: { type: Boolean, default: false }
            },
            sunday: { 
                start: { type: String, default: '00:00' }, 
                end: { type: String, default: '00:00' }, 
                enabled: { type: Boolean, default: false }
            }
        },
        afterHoursMessage: {
            type: String,
            default: 'Gracias por contactarnos. Nuestro horario de atención es de lunes a viernes de 9:00 a 18:00. Te responderemos lo antes posible.'
        }
    },

    // Metadata
    lastModifiedBy: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Agent'
    },
    lastModifiedAt: {
        type: Date,
        default: Date.now
    }
}, {
    timestamps: true
});

// Static method to get or create settings
crmSettingsSchema.statics.getSettings = async function() {
    let settings = await this.findById('crm_settings');

    if (!settings) {
        console.log('📋 Creating default CRM settings...');
        settings = await this.create({ _id: 'crm_settings' });
    }

    return settings;
};

// Static method to update settings
crmSettingsSchema.statics.updateSettings = async function(updates, modifiedBy) {
    const settings = await this.getSettings();

    Object.assign(settings, updates);
    settings.lastModifiedBy = modifiedBy;
    settings.lastModifiedAt = new Date();

    await settings.save();
    return settings;
};

// Helper method to get timeout for specific status
crmSettingsSchema.methods.getTimeoutForStatus = function(status) {
    return this.autoTimeout[status] || this.autoTimeout.assigned;
};

// Helper method to check if within business hours
crmSettingsSchema.methods.isWithinBusinessHours = function(date = new Date()) {
    if (!this.businessHours.enabled) return true;

    const days = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];
    const dayName = days[date.getDay()];
    const schedule = this.businessHours.schedule[dayName];

    if (!schedule.enabled) return false;

    const currentTime = date.toTimeString().slice(0, 5); // HH:MM format
    return currentTime >= schedule.start && currentTime <= schedule.end;
};

module.exports = mongoose.model('CRMSettings', crmSettingsSchema);
