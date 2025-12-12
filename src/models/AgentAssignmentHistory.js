const mongoose = require('mongoose');

/**
 * Tracks historical data of agent assignments to conversations
 * Stores conversation context when agent takes over and summary when agent releases
 */
const agentAssignmentHistorySchema = new mongoose.Schema({
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
    agentId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Agent',
        required: true,
        index: true
    },
    assignedBy: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Agent'
    },

    // Assignment Details
    assignedAt: {
        type: Date,
        required: true,
        index: true
    },
    releasedAt: Date,
    duration: Number, // Duration in seconds

    // Conversation Context when Agent Takes Over
    contextSummary: {
        totalMessages: { type: Number },
        aiMessagesCount: { type: Number },
        customerMessagesCount: { type: Number },
        lastMessages: [{
            content: { type: String },
            sender: { type: String }, // 'customer', 'ai', 'system'
            timestamp: { type: Date },
            type: { type: String } // 'text', 'image', 'location', etc.
        }],
        conversationStartedAt: { type: Date },
        conversationStatus: { type: String },
        priority: { type: String },
        category: { type: String },
        tags: [{ type: String }],
        keyTopics: [{ type: String }], // AI-extracted topics from conversation
        customerSentiment: { type: String }, // 'positive', 'neutral', 'negative', 'frustrated'
        assignmentTime: { type: Date } // When agent took over
    },

    // Agent Interaction Summary (when releasing back to AI)
    agentSummary: {
        messagesSent: { type: Number },
        actionsPerformed: [{ type: String }], // 'transferred', 'added_note', 'changed_status', etc.
        resolutionNotes: { type: String }, // Agent's notes about what was done
        issueResolved: { type: Boolean },
        followUpRequired: { type: Boolean },
        followUpNotes: { type: String },
        customerSatisfaction: { type: String }, // 'satisfied', 'neutral', 'dissatisfied', 'unknown'
        escalated: { type: Boolean },
        escalationReason: { type: String }
    },

    // AI Analysis of Agent Performance
    aiAnalysis: {
        // Issue Resolution
        issueResolution: {
            wasResolved: { type: Boolean },
            resolutionQuality: { type: String }, // 'excellent', 'good', 'partial', 'poor', 'unresolved'
            explanation: { type: String },
            issueType: { type: String }, // 'technical', 'billing', 'general_inquiry', 'complaint', 'other'
            rootCause: { type: String }
        },
        
        // Agent Performance Scores
        agentPerformance: {
            overallScore: { type: Number }, // 1-10
            professionalism: { type: Number },
            responsiveness: { type: Number },
            knowledgeability: { type: Number },
            empathy: { type: Number },
            problemSolving: { type: Number },
            strengths: [{ type: String }],
            areasForImprovement: [{ type: String }],
            criticalIssues: [{ type: String }]
        },
        
        // Customer Sentiment Analysis
        customerSentiment: {
            initial: { type: String }, // 'frustrated', 'concerned', 'neutral', 'satisfied'
            final: { type: String }, // 'angry', 'frustrated', 'neutral', 'satisfied', 'happy'
            sentimentChange: { type: String }, // 'improved', 'worsened', 'unchanged'
            likelyToRecommend: { type: Boolean },
            explanation: { type: String }
        },
        
        // Conversation Quality Metrics
        conversationQuality: {
            clarityScore: { type: Number }, // 1-10
            efficiencyScore: { type: Number },
            completenessScore: { type: Number },
            overallQuality: { type: String } // 'excellent', 'good', 'fair', 'poor'
        },
        
        // Action Items
        actionItems: {
            followUpRequired: { type: Boolean },
            followUpTasks: [{ type: String }],
            escalationNeeded: { type: Boolean },
            escalationReason: { type: String }
        },
        
        // Recommendations
        recommendations: {
            forAgent: [{ type: String }],
            forSystem: [{ type: String }],
            forTraining: [{ type: String }]
        },
        
        // Summary
        summary: {
            brief: { type: String }, // 2-3 sentences
            detailed: { type: String }, // Full paragraph
            keyPoints: [{ type: String }]
        },
        
        // Auto-generated tags and risk
        tags: [{ type: String }],
        riskLevel: { type: String }, // 'none', 'low', 'medium', 'high', 'critical'
        
        // Analysis metadata
        analyzedAt: { type: Date },
        analysisModel: { type: String }, // Which AI model performed the analysis
        analysisError: { type: String } // If analysis failed
    },

    // Release Details
    releaseReason: { type: String }, // 'resolved', 'timeout', 'transferred', 'manual', 'system'
    releaseMethod: {
        type: String,
        enum: ['manual', 'automatic', 'timeout', 'transfer'],
        default: 'manual'
    },

    // Metrics
    firstResponseTime: { type: Number }, // Time to first agent response in seconds
    averageResponseTime: { type: Number }, // Average agent response time in seconds
    totalResponses: { type: Number },

    // Status at the time of release
    finalStatus: { type: String },
    transferredTo: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Agent'
    },

    // Notes
    internalNotes: { type: String }

}, {
    timestamps: true
});

// Compound indexes for common queries
agentAssignmentHistorySchema.index({ conversationId: 1, assignedAt: -1 });
agentAssignmentHistorySchema.index({ agentId: 1, assignedAt: -1 });
agentAssignmentHistorySchema.index({ customerId: 1, assignedAt: -1 });
agentAssignmentHistorySchema.index({ assignedAt: -1 });

// Methods
agentAssignmentHistorySchema.methods.calculateDuration = function() {
    if (this.releasedAt && this.assignedAt) {
        this.duration = Math.floor((this.releasedAt - this.assignedAt) / 1000);
    }
    return this.duration;
};

module.exports = mongoose.model('AgentAssignmentHistory', agentAssignmentHistorySchema);
