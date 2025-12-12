const Conversation = require('../models/Conversation');
const Message = require('../models/Message');
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

        // Log template messages for debugging
        messages.forEach(msg => {
            if (msg.type === 'template') {
                console.log('\n📋 Template Message Found:');
                console.log('   Message ID:', msg._id);
                console.log('   Content:', msg.content);
                console.log('   Template Name:', msg.template?.name);
                console.log('   Template Parameters:', msg.template?.parameters);
                console.log('   Content Preview:', msg.content.substring(0, 100));
            }
        });

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
    addInternalNote
};
