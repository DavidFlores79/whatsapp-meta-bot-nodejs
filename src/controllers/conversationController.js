const Conversation = require('../models/Conversation');
const Message = require('../models/Message');
const AgentAssignmentHistory = require('../models/AgentAssignmentHistory');
const agentAssignmentService = require('../services/agentAssignmentService');
const agentMessageRelayService = require('../services/agentMessageRelayService');
const autoTimeoutService = require('../services/autoTimeoutService');

/**
 * GET /api/v2/conversations
 */
async function getConversations(req, res) {
    try {
        const { status, assignedAgent, limit = 50, skip = 0 } = req.query;

        const filter = {};
        if (status) filter.status = status;
        if (assignedAgent) filter.assignedAgent = assignedAgent;

        const conversations = await Conversation.find(filter)
            .populate('customerId', 'firstName lastName phoneNumber avatar')
            .populate('assignedAgent', 'firstName lastName email avatar status')
            .sort({ lastCustomerMessage: -1 })
            .limit(parseInt(limit))
            .skip(parseInt(skip));

        const total = await Conversation.countDocuments(filter);

        return res.json({
            conversations,
            pagination: {
                total,
                limit: parseInt(limit),
                skip: parseInt(skip)
            }
        });
    } catch (error) {
        console.error('Get conversations error:', error);
        return res.status(500).json({ error: error.message });
    }
}

/**
 * GET /api/v2/conversations/assigned
 */
async function getAssignedConversations(req, res) {
    try {
        const agentId = req.agent._id;

        const conversations = await Conversation.find({
            assignedAgent: agentId,
            status: { $in: ['assigned', 'waiting'] }
        })
            .populate('customerId', 'firstName lastName phoneNumber avatar')
            .sort({ lastCustomerMessage: -1 });

        return res.json({ conversations });
    } catch (error) {
        console.error('Get assigned conversations error:', error);
        return res.status(500).json({ error: error.message });
    }
}

/**
 * GET /api/v2/conversations/:id
 */
async function getConversationById(req, res) {
    try {
        const conversation = await Conversation.findById(req.params.id)
            .populate('customerId')
            .populate('assignedAgent', 'firstName lastName email avatar status');

        if (!conversation) {
            return res.status(404).json({ error: 'Conversation not found' });
        }

        return res.json({ conversation });
    } catch (error) {
        console.error('Get conversation error:', error);
        return res.status(500).json({ error: error.message });
    }
}

/**
 * POST /api/v2/conversations/:id/assign
 */
async function assignConversation(req, res) {
    try {
        const { agentId } = req.body;
        const conversationId = req.params.id;

        const result = await agentAssignmentService.assignConversationToAgent(
            conversationId,
            agentId || req.agent._id,  // If no agentId, assign to self
            req.agent._id
        );

        return res.json(result);
    } catch (error) {
        console.error('Assign conversation error:', error);
        return res.status(500).json({ error: error.message });
    }
}

/**
 * POST /api/v2/conversations/:id/release
 */
async function releaseConversation(req, res) {
    try {
        const { reason } = req.body;
        const conversationId = req.params.id;
        const agentId = req.agent._id;

        const result = await agentAssignmentService.releaseConversation(
            conversationId,
            agentId,
            reason
        );

        return res.json(result);
    } catch (error) {
        console.error('Release conversation error:', error);
        return res.status(500).json({ error: error.message });
    }
}

/**
 * POST /api/v2/conversations/:id/transfer
 */
async function transferConversation(req, res) {
    try {
        const { toAgentId, reason } = req.body;
        const conversationId = req.params.id;
        const fromAgentId = req.agent._id;

        if (!toAgentId) {
            return res.status(400).json({ error: 'toAgentId required' });
        }

        const result = await agentAssignmentService.transferConversation(
            conversationId,
            fromAgentId,
            toAgentId,
            reason
        );

        return res.json(result);
    } catch (error) {
        console.error('Transfer conversation error:', error);
        return res.status(500).json({ error: error.message });
    }
}

/**
 * POST /api/v2/conversations/:id/reply
 */
async function sendReply(req, res) {
    try {
        const { message } = req.body;
        const conversationId = req.params.id;
        const agentId = req.agent._id;

        if (!message || !message.trim()) {
            return res.status(400).json({ error: 'Message cannot be empty' });
        }

        // Get conversation with customer info
        const conversation = await Conversation.findById(conversationId)
            .populate('customerId');

        if (!conversation) {
            return res.status(404).json({ error: 'Conversation not found' });
        }

        // Verify agent is assigned
        if (conversation.assignedAgent?.toString() !== agentId.toString()) {
            return res.status(403).json({ error: 'Conversation not assigned to you' });
        }

        // Send message
        const newMessage = await agentMessageRelayService.sendAgentMessageToCustomer(
            conversationId,
            conversation.customerId._id,
            agentId,
            conversation.customerId.phoneNumber,
            message.trim(),
            'web'
        );

        return res.json({ message: newMessage });
    } catch (error) {
        console.error('Send reply error:', error);
        return res.status(500).json({ error: error.message });
    }
}

/**
 * GET /api/v2/conversations/:id/messages
 */
async function getConversationMessages(req, res) {
    try {
        const conversationId = req.params.id;
        const { limit = 500, skip = 0 } = req.query;

        // Get all messages for the conversation, sorted by timestamp ascending (oldest first)
        const messages = await Message.find({ conversationId })
            .populate('agentId', 'firstName lastName avatar')
            .sort({ timestamp: 1 })
            .limit(parseInt(limit))
            .skip(parseInt(skip));

        return res.json({ messages, total: messages.length });
    } catch (error) {
        console.error('Get messages error:', error);
        return res.status(500).json({ error: error.message });
    }
}

/**
 * POST /api/v2/conversations/:id/resume-ai
 */
async function resumeAI(req, res) {
    try {
        const conversationId = req.params.id;
        const agentId = req.agent._id;

        const result = await autoTimeoutService.manualResumeAI(conversationId, agentId);

        return res.json(result);
    } catch (error) {
        console.error('Resume AI error:', error);
        return res.status(500).json({ error: error.message });
    }
}

/**
 * POST /api/v2/conversations/:id/notes
 */
async function addInternalNote(req, res) {
    try {
        const { content, isVisible = false } = req.body;
        const conversationId = req.params.id;
        const agentId = req.agent._id;

        if (!content || !content.trim()) {
            return res.status(400).json({ error: 'Note content required' });
        }

        const conversation = await Conversation.findByIdAndUpdate(
            conversationId,
            {
                $push: {
                    internalNotes: {
                        agent: agentId,
                        content: content.trim(),
                        timestamp: new Date(),
                        isVisible
                    }
                }
            },
            { new: true }
        );

        if (!conversation) {
            return res.status(404).json({ error: 'Conversation not found' });
        }

        return res.json({ success: true, conversation });
    } catch (error) {
        console.error('Add note error:', error);
        return res.status(500).json({ error: error.message });
    }
}

/**
 * GET /api/v2/conversations/:id/assignment-history
 * Get all assignment history for a conversation
 */
async function getAssignmentHistory(req, res) {
    try {
        const conversationId = req.params.id;
        console.log('[ConversationController] getAssignmentHistory called for conversation:', conversationId);

        const history = await AgentAssignmentHistory.find({ conversationId })
            .populate('agentId', 'firstName lastName email avatar')
            .populate('assignedBy', 'firstName lastName email')
            .populate('transferredTo', 'firstName lastName email')
            .sort({ assignedAt: -1 });

        console.log('[ConversationController] Found', history.length, 'assignment records');

        const stats = {
            totalAssignments: history.length,
            totalDuration: history.reduce((sum, h) => sum + (h.duration || 0), 0),
            averageDuration: history.length > 0 
                ? Math.floor(history.reduce((sum, h) => sum + (h.duration || 0), 0) / history.length)
                : 0,
            uniqueAgents: [...new Set(history.map(h => h.agentId?._id.toString()))].length,
            resolvedCount: history.filter(h => h.aiAnalysis?.issueResolution?.wasResolved).length,
            averagePerformanceScore: history.length > 0
                ? (history.reduce((sum, h) => sum + (h.aiAnalysis?.agentPerformance?.overallScore || 0), 0) / history.length).toFixed(1)
                : 0
        };

        console.log('[ConversationController] Calculated stats:', stats);

        return res.json({ history, stats });
    } catch (error) {
        console.error('[ConversationController] Get assignment history error:', error);
        return res.status(500).json({ error: error.message });
    }
}

/**
 * GET /api/v2/agents/:agentId/performance
 * Get agent performance analytics across all assignments
 */
async function getAgentPerformance(req, res) {
    try {
        const agentId = req.params.agentId;
        const { startDate, endDate, limit = 50 } = req.query;

        console.log('[getAgentPerformance] Query params:', { agentId, startDate, endDate, limit });

        const filter = { agentId };
        
        if (startDate || endDate) {
            filter.assignedAt = {};
            if (startDate) filter.assignedAt.$gte = new Date(startDate);
            if (endDate) filter.assignedAt.$lte = new Date(endDate);
        }

        console.log('[getAgentPerformance] Filter:', filter);

        // Optimize query - remove heavy populates, limit results early
        const assignments = await AgentAssignmentHistory.find(filter)
            .select('-contextSummary') // Exclude large text fields
            .sort({ assignedAt: -1 })
            .limit(parseInt(limit))
            .lean(); // Use lean for better performance

        console.log('[getAgentPerformance] Found', assignments.length, 'assignments');

        // Calculate aggregate performance metrics
        const withAnalysis = assignments.filter(a => a.aiAnalysis?.agentPerformance?.overallScore);
        
        const analytics = {
            totalAssignments: assignments.length,
            analyzedAssignments: withAnalysis.length,
            totalDuration: assignments.reduce((sum, a) => sum + (a.duration || 0), 0),
            averageDuration: assignments.length > 0 
                ? Math.floor(assignments.reduce((sum, a) => sum + (a.duration || 0), 0) / assignments.length)
                : 0,
            
            // Performance scores
            performance: withAnalysis.length > 0 ? {
                overallScore: (withAnalysis.reduce((sum, a) => sum + a.aiAnalysis.agentPerformance.overallScore, 0) / withAnalysis.length).toFixed(2),
                professionalism: (withAnalysis.reduce((sum, a) => sum + (a.aiAnalysis.agentPerformance.professionalism || 0), 0) / withAnalysis.length).toFixed(2),
                responsiveness: (withAnalysis.reduce((sum, a) => sum + (a.aiAnalysis.agentPerformance.responsiveness || 0), 0) / withAnalysis.length).toFixed(2),
                knowledgeability: (withAnalysis.reduce((sum, a) => sum + (a.aiAnalysis.agentPerformance.knowledgeability || 0), 0) / withAnalysis.length).toFixed(2),
                empathy: (withAnalysis.reduce((sum, a) => sum + (a.aiAnalysis.agentPerformance.empathy || 0), 0) / withAnalysis.length).toFixed(2),
                problemSolving: (withAnalysis.reduce((sum, a) => sum + (a.aiAnalysis.agentPerformance.problemSolving || 0), 0) / withAnalysis.length).toFixed(2)
            } : null,
            
            // Resolution metrics
            resolution: {
                totalResolved: assignments.filter(a => a.aiAnalysis?.issueResolution?.wasResolved).length,
                resolutionRate: assignments.length > 0 
                    ? ((assignments.filter(a => a.aiAnalysis?.issueResolution?.wasResolved).length / assignments.length) * 100).toFixed(1)
                    : 0,
                qualityBreakdown: {
                    excellent: assignments.filter(a => a.aiAnalysis?.issueResolution?.resolutionQuality === 'excellent').length,
                    good: assignments.filter(a => a.aiAnalysis?.issueResolution?.resolutionQuality === 'good').length,
                    partial: assignments.filter(a => a.aiAnalysis?.issueResolution?.resolutionQuality === 'partial').length,
                    poor: assignments.filter(a => a.aiAnalysis?.issueResolution?.resolutionQuality === 'poor').length,
                    unresolved: assignments.filter(a => a.aiAnalysis?.issueResolution?.resolutionQuality === 'unresolved').length
                }
            },
            
            // Sentiment analysis
            sentiment: {
                improved: assignments.filter(a => a.aiAnalysis?.customerSentiment?.sentimentChange === 'improved').length,
                worsened: assignments.filter(a => a.aiAnalysis?.customerSentiment?.sentimentChange === 'worsened').length,
                unchanged: assignments.filter(a => a.aiAnalysis?.customerSentiment?.sentimentChange === 'unchanged').length,
                improvementRate: assignments.length > 0
                    ? ((assignments.filter(a => a.aiAnalysis?.customerSentiment?.sentimentChange === 'improved').length / assignments.length) * 100).toFixed(1)
                    : 0
            },
            
            // Common strengths and areas for improvement
            commonStrengths: _getMostCommon(
                withAnalysis.flatMap(a => a.aiAnalysis.agentPerformance.strengths || [])
            ),
            commonImprovements: _getMostCommon(
                withAnalysis.flatMap(a => a.aiAnalysis.agentPerformance.areasForImprovement || [])
            ),
            
            // Risk and escalation
            riskLevels: {
                none: assignments.filter(a => a.aiAnalysis?.riskLevel === 'none').length,
                low: assignments.filter(a => a.aiAnalysis?.riskLevel === 'low').length,
                medium: assignments.filter(a => a.aiAnalysis?.riskLevel === 'medium').length,
                high: assignments.filter(a => a.aiAnalysis?.riskLevel === 'high').length,
                critical: assignments.filter(a => a.aiAnalysis?.riskLevel === 'critical').length
            }
        };

        return res.json({ 
            analytics,
            recentAssignments: assignments.slice(0, 10) // Last 10 for detail view
        });
    } catch (error) {
        console.error('Get agent performance error:', error);
        return res.status(500).json({ error: error.message });
    }
}

/**
 * Helper: Get most common items from array
 */
function _getMostCommon(arr, topN = 5) {
    const counts = {};
    arr.forEach(item => counts[item] = (counts[item] || 0) + 1);
    return Object.entries(counts)
        .sort((a, b) => b[1] - a[1])
        .slice(0, topN)
        .map(([item, count]) => ({ item, count }));
}

module.exports = {
    getConversations,
    getAssignedConversations,
    getConversationById,
    assignConversation,
    releaseConversation,
    transferConversation,
    sendReply,
    getConversationMessages,
    resumeAI,
    addInternalNote,
    getAssignmentHistory,
    getAgentPerformance
};
