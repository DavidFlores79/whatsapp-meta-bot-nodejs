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

        // OPTIMIZED: Use lean() and limit populate fields
        const conversations = await Conversation.find(filter)
            .populate('customerId', 'firstName lastName phoneNumber avatar')
            .populate('assignedAgent', 'firstName lastName email avatar status')
            .select('-internalNotes -contextSummary') // Exclude heavy fields
            .sort({ lastCustomerMessage: -1 })
            .limit(parseInt(limit))
            .skip(parseInt(skip))
            .lean()
            .maxTimeMS(10000); // 10 second timeout

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
 * GET /api/v2/conversations/:id/thread-metadata
 * Get OpenAI thread metadata for a conversation
 */
async function getThreadMetadata(req, res) {
    try {
        const conversationId = req.params.id;
        const openaiService = require('../services/openaiService');

        // Get conversation with customer info
        const conversation = await Conversation.findById(conversationId)
            .populate('customerId');

        if (!conversation) {
            return res.status(404).json({ error: 'Conversation not found' });
        }

        if (!conversation.customerId) {
            return res.status(404).json({ error: 'No customer associated with this conversation' });
        }

        // Get thread metadata from OpenAI
        const metadata = await openaiService.getThreadMetadata(conversation.customerId.phoneNumber);

        return res.json({ metadata });
    } catch (error) {
        console.error('Get thread metadata error:', error);
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
            if (startDate) {
                const start = new Date(startDate);
                start.setHours(0, 0, 0, 0);
                filter.assignedAt.$gte = start;
            }
            if (endDate) {
                const end = new Date(endDate);
                end.setHours(23, 59, 59, 999); // End of day
                filter.assignedAt.$lte = end;
            }
        }

        console.log('[getAgentPerformance] Filter:', JSON.stringify(filter, null, 2));

        // OPTIMIZED: Only select fields needed for analytics, exclude heavy nested objects
        const assignments = await AgentAssignmentHistory.find(filter)
            .select({
                'agentId': 1,
                'conversationId': 1,
                'customerId': 1,
                'assignedAt': 1,
                'releasedAt': 1,
                'duration': 1,
                'releaseReason': 1,
                'finalStatus': 1,
                // Only select specific aiAnalysis fields needed
                'aiAnalysis.agentPerformance.overallScore': 1,
                'aiAnalysis.agentPerformance.professionalism': 1,
                'aiAnalysis.agentPerformance.responsiveness': 1,
                'aiAnalysis.agentPerformance.knowledgeability': 1,
                'aiAnalysis.agentPerformance.empathy': 1,
                'aiAnalysis.agentPerformance.problemSolving': 1,
                'aiAnalysis.agentPerformance.strengths': 1,
                'aiAnalysis.agentPerformance.areasForImprovement': 1,
                'aiAnalysis.issueResolution.wasResolved': 1,
                'aiAnalysis.issueResolution.resolutionQuality': 1,
                'aiAnalysis.customerSentiment.sentimentChange': 1,
                'aiAnalysis.riskLevel': 1
            })
            .sort({ assignedAt: -1 })
            .limit(parseInt(limit))
            .lean() // Use lean for better performance
            .maxTimeMS(15000); // 15 second timeout

        console.log('[getAgentPerformance] Found', assignments.length, 'assignments');

        // Show actual date range of assignments for debugging
        if (assignments.length > 0) {
            const dates = assignments.map(a => a.assignedAt).sort();
            console.log('[getAgentPerformance] Assignment date range:', {
                earliest: dates[0],
                latest: dates[dates.length - 1]
            });
        }

        // If no assignments found with date filter, log helpful message
        if (assignments.length === 0 && (startDate || endDate)) {
            console.log('[getAgentPerformance] ⚠️ No assignments found in date range.');
            console.log('[getAgentPerformance] Try querying without date filter to see all assignments.');
            
            // Return helpful response
            return res.json({
                analytics: {
                    totalAssignments: 0,
                    analyzedAssignments: 0,
                    releasedAssignments: 0,
                    activeAssignments: 0,
                    totalDuration: 0,
                    averageDuration: 0,
                    performance: null,
                    resolution: {
                        totalResolved: 0,
                        resolutionRate: 0,
                        qualityBreakdown: {
                            excellent: 0,
                            good: 0,
                            partial: 0,
                            poor: 0,
                            unresolved: 0
                        }
                    },
                    sentiment: {
                        improved: 0,
                        worsened: 0,
                        unchanged: 0,
                        improvementRate: 0
                    },
                    commonStrengths: [],
                    commonImprovements: [],
                    riskLevels: {
                        none: 0,
                        low: 0,
                        medium: 0,
                        high: 0,
                        critical: 0
                    }
                },
                recentAssignments: [],
                message: 'No assignments found in the selected date range. Try removing date filters or selecting a different date range.'
            });
        }

        // Calculate aggregate performance metrics
        const withAnalysis = assignments.filter(a => a.aiAnalysis?.agentPerformance?.overallScore);
        const releasedAssignments = assignments.filter(a => a.releasedAt);
        const activeAssignments = assignments.filter(a => !a.releasedAt);
        
        console.log('[getAgentPerformance] Stats:', {
            total: assignments.length,
            withAnalysis: withAnalysis.length,
            released: releasedAssignments.length,
            active: activeAssignments.length
        });

        // Log sample of first assignment for debugging
        if (assignments.length > 0 && withAnalysis.length === 0) {
            console.log('[getAgentPerformance] ⚠️ Assignments exist but none have AI analysis yet');
            console.log('[getAgentPerformance] Sample assignment:', {
                id: assignments[0]._id,
                assignedAt: assignments[0].assignedAt,
                releasedAt: assignments[0].releasedAt,
                hasAiAnalysis: !!assignments[0].aiAnalysis,
                hasPerformanceScore: !!assignments[0].aiAnalysis?.agentPerformance?.overallScore
            });
        }
        
        const analytics = {
            totalAssignments: assignments.length,
            analyzedAssignments: withAnalysis.length,
            releasedAssignments: releasedAssignments.length,
            activeAssignments: activeAssignments.length,
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
        console.error('[getAgentPerformance] Error:', error);
        
        // Handle timeout errors specifically
        if (error.name === 'MongooseError' && error.message?.includes('buffering timed out')) {
            return res.status(504).json({ 
                error: 'Query timeout - too much data. Try using date filters to narrow the search.' 
            });
        }
        
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

/**
 * POST /api/v2/conversations/:id/resolve
 * Mark conversation as resolved
 */
async function resolveConversationEndpoint(req, res) {
    try {
        const { resolutionNotes } = req.body;
        const conversationId = req.params.id;
        const agentId = req.agent._id;

        const lifecycleService = require('../services/conversationLifecycleService');
        const result = await lifecycleService.resolveConversation(
            conversationId,
            agentId,
            resolutionNotes
        );

        return res.json(result);
    } catch (error) {
        console.error('Resolve conversation error:', error);
        return res.status(500).json({ error: error.message });
    }
}

/**
 * POST /api/v2/conversations/:id/close
 * Close conversation (final state)
 */
async function closeConversationEndpoint(req, res) {
    try {
        const { reason, force } = req.body;
        const conversationId = req.params.id;
        const agentId = req.agent._id;

        const lifecycleService = require('../services/conversationLifecycleService');
        const result = await lifecycleService.closeConversation(
            conversationId,
            agentId,
            reason,
            force || false
        );

        return res.json(result);
    } catch (error) {
        console.error('Close conversation error:', error);
        return res.status(500).json({ error: error.message });
    }
}

/**
 * POST /api/v2/conversations/:id/reopen
 * Reopen closed conversation (admin/supervisor only)
 */
async function reopenConversationEndpoint(req, res) {
    try {
        const { reason } = req.body;
        const conversationId = req.params.id;
        const agentId = req.agent._id;

        const lifecycleService = require('../services/conversationLifecycleService');
        const result = await lifecycleService.reopenConversation(
            conversationId,
            agentId,
            reason
        );

        return res.json(result);
    } catch (error) {
        console.error('Reopen conversation error:', error);
        return res.status(500).json({ error: error.message });
    }
}

/**
 * POST /api/v2/conversations/:id/priority
 * Set conversation priority
 */
async function setConversationPriorityEndpoint(req, res) {
    try {
        const { priority, reason } = req.body;
        const conversationId = req.params.id;
        const agentId = req.agent._id;

        if (!['low', 'medium', 'high', 'urgent'].includes(priority)) {
            return res.status(400).json({ error: 'Invalid priority value' });
        }

        const escalationService = require('../services/priorityEscalationService');
        const result = await escalationService.setConversationPriority(
            conversationId,
            priority,
            agentId,
            reason
        );

        return res.json(result);
    } catch (error) {
        console.error('Set priority error:', error);
        return res.status(500).json({ error: error.message });
    }
}

module.exports = {
    getConversations,
    getAssignedConversations,
    getConversationById,
    assignConversation,
    releaseConversation,
    transferConversation,
    sendReply,
    getThreadMetadata,
    getConversationMessages,
    resumeAI,
    addInternalNote,
    getAssignmentHistory,
    getAgentPerformance,
    resolveConversationEndpoint,
    closeConversationEndpoint,
    reopenConversationEndpoint,
    setConversationPriorityEndpoint
};
