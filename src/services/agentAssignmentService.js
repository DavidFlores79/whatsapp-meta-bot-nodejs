const Agent = require('../models/Agent');
const Conversation = require('../models/Conversation');
const AgentAssignmentHistory = require('../models/AgentAssignmentHistory');
const Message = require('../models/Message');
const conversationAnalysisService = require('./conversationAnalysisService');
const agentNotificationService = require('./agentNotificationService');

/**
 * Get available agents for assignment
 */
async function getAvailableAgents(filters = {}) {
    const query = {
        isActive: true,
        status: { $in: ['online', 'away'] },
        ...filters
    };

    console.log(`🔍 Searching for available agents with filters:`, query);

    const agents = await Agent.find(query)
        .where('statistics.activeAssignments')
        .lt(20); // Max 20 concurrent chats (using the max value from schema)

    console.log(`📊 Found ${agents.length} available agent(s):`, 
        agents.map(a => `${a.email} (${a.status}, ${a.statistics.activeAssignments} chats)`).join(', ') || 'none'
    );

    return agents.sort((a, b) =>
        a.statistics.activeAssignments - b.statistics.activeAssignments
    );
}

/**
 * Auto-assign conversation to best available agent
 */
async function autoAssignConversation(conversationId) {
    const conversation = await Conversation.findById(conversationId);
    if (!conversation || conversation.assignedAgent) {
        return null;
    }

    // Get available agents with auto-assign enabled
    let availableAgents = await getAvailableAgents({ autoAssign: true });

    // Fallback: if no auto-assign agents, get ANY available agent
    if (availableAgents.length === 0) {
        console.log('⚠️ No auto-assign agents available, trying any available agent');
        availableAgents = await getAvailableAgents();
    }

    if (availableAgents.length === 0) {
        console.log('❌ No available agents for assignment');
        return null;
    }

    // Simple load balancing: assign to agent with fewest active chats
    const selectedAgent = availableAgents[0];
    console.log(`✅ Selected agent ${selectedAgent.email} for auto-assignment (${selectedAgent.statistics.activeAssignments} active chats)`);

    return await assignConversationToAgent(conversationId, selectedAgent._id);
}

/**
 * Manually assign conversation to specific agent
 */
async function assignConversationToAgent(conversationId, agentId, assignedBy = null) {
    const { io } = require('../models/server');
    const Customer = require('../models/Customer');

    let conversation = await Conversation.findById(conversationId)
        .populate('customerId');

    // Fallback: if not found by ID, try to find by phone number (legacy support)
    if (!conversation && conversationId.match(/^\d+$/)) {
        console.log(`⚠️ Conversation not found by ID, trying phone number lookup: ${conversationId}`);
        const customer = await Customer.findOne({ phoneNumber: conversationId });
        if (customer) {
            conversation = await Conversation.findOne({
                customerId: customer._id,
                status: { $in: ['open', 'assigned', 'waiting'] }
            }).populate('customerId');
        }
    }

    if (!conversation) {
        throw new Error('Conversation not found');
    }

    const agent = await Agent.findById(agentId);
    if (!agent || !agent.isActive) {
        throw new Error('Agent not found or inactive');
    }

    // Check if agent has auto-assign enabled (required to take conversations)
    if (!agent.autoAssign) {
        throw new Error('Agent must enable auto-assign to take conversations');
    }

    // Check if agent has capacity
    if (agent.statistics.activeAssignments >= agent.maxConcurrentChats) {
        throw new Error('Agent has reached maximum concurrent chats');
    }

    // Determine agent's preferred language for summary
    // Use first language if available, otherwise default to 'es-MX'
    const agentLanguage = agent.languages && agent.languages.length > 0 
        ? (agent.languages[0] === 'en' ? 'en-US' : 'es-MX')
        : 'es-MX';

    // Generate conversation summary for agent context in their preferred language
    console.log(`📊 Generating conversation summary for agent in ${agentLanguage}...`);
    const conversationSummary = await conversationAnalysisService.generateConversationSummary(
        conversationId,
        10, // Last 10 messages
        agentLanguage
    );

    // Update conversation
    conversation.assignedAgent = agentId;
    conversation.assignedAt = new Date();
    conversation.assignedBy = assignedBy;
    conversation.status = 'assigned';
    conversation.isAIEnabled = false;  // Disable AI when assigned to agent

    await conversation.save();

    // Create assignment history record with context
    const assignmentHistory = new AgentAssignmentHistory({
        conversationId: conversation._id,
        customerId: conversation.customerId._id,
        agentId,
        assignedBy,
        assignedAt: new Date(),
        contextSummary: {
            totalMessages: conversationSummary.metadata?.totalMessages || 0,
            aiMessagesCount: conversationSummary.metadata?.aiMessagesCount || 0,
            customerMessagesCount: conversationSummary.metadata?.customerMessagesCount || 0,
            lastMessages: conversationSummary.metadata?.lastMessages || [],
            conversationStartedAt: conversation.createdAt,
            conversationStatus: conversation.status,
            priority: conversation.priority,
            category: conversation.category,
            tags: conversation.tags,
            keyTopics: conversationSummary.keyPoints || [],
            customerSentiment: conversationSummary.sentiment || 'neutral',
            assignmentTime: new Date() // Track when agent took over
        }
    });

    await assignmentHistory.save();
    console.log(`✅ Assignment history created: ${assignmentHistory._id}`);

    // Update agent statistics
    agent.statistics.activeAssignments += 1;
    agent.statistics.totalAssignments += 1;
    await agent.save();

    // Emit socket event to agent WITH SUMMARY
    io.to(`agent_${agentId}`).emit('conversation_assigned', {
        conversationId: conversation._id,
        customerId: conversation.customerId._id,
        customerName: conversation.customerId.firstName || conversation.customerId.phoneNumber,
        customerPhone: conversation.customerId.phoneNumber,
        lastMessage: conversation.lastMessage,
        assignedAt: conversation.assignedAt,
        summary: conversationSummary, // Include AI-generated summary
        assignmentHistoryId: assignmentHistory._id
    });

    // Emit to all agents (for dashboard updates)
    io.emit('agent_assignment_update', {
        agentId,
        conversationId,
        action: 'assigned'
    });

    console.log(`✅ Conversation ${conversationId} assigned to agent ${agentId}`);

    // Send WhatsApp notification to agent (non-blocking)
    agentNotificationService.sendAssignmentNotification(
        agent,
        conversation.customerId,
        conversation
    ).catch(error => {
        console.error('Failed to send WhatsApp notification to agent:', error);
        // Continue even if notification fails
    });

    return {
        conversation,
        agent,
        summary: conversationSummary,
        assignmentHistoryId: assignmentHistory._id
    };
}

/**
 * Release conversation from agent (back to AI)
 */
async function releaseConversation(conversationId, agentId, reason = null) {
    const { io } = require('../models/server');
    const Customer = require('../models/Customer');

    let conversation = await Conversation.findById(conversationId);

    // Fallback: if not found by ID, try to find by phone number (legacy support)
    if (!conversation && conversationId.match(/^\d+$/)) {
        console.log(`⚠️ Conversation not found by ID, trying phone number lookup: ${conversationId}`);
        const customer = await Customer.findOne({ phoneNumber: conversationId });
        if (customer) {
            conversation = await Conversation.findOne({
                customerId: customer._id,
                status: { $in: ['open', 'assigned', 'waiting'] }
            });
        }
    }

    if (!conversation) {
        throw new Error('Conversation not found');
    }

    if (conversation.assignedAgent?.toString() !== agentId.toString()) {
        throw new Error('Conversation not assigned to this agent');
    }

    // Fetch agent details first (needed for language preferences)
    const agent = await Agent.findById(agentId);
    if (!agent) {
        throw new Error('Agent not found');
    }

    const previousAgent = conversation.assignedAgent;
    const releaseTime = new Date();

    // Find active assignment history record
    const assignmentHistory = await AgentAssignmentHistory.findOne({
        conversationId: conversation._id,
        agentId,
        releasedAt: null // Still active
    }).sort({ assignedAt: -1 });

    if (assignmentHistory) {
        console.log('📊 Generating AI analysis of agent interaction...');
        
        // Calculate agent metrics
        const agentMessages = await Message.countDocuments({
            conversationId: conversation._id,
            sender: 'agent',
            agentId,
            timestamp: { $gte: assignmentHistory.assignedAt }
        });

        // Determine agent's preferred language (same as used for summary)
        const agentLanguage = agent.languages && agent.languages.length > 0 
            ? (agent.languages[0] === 'en' ? 'en-US' : 'es-MX')
            : 'es-MX';

        // Generate AI analysis of the interaction in agent's language
        const aiAnalysis = await conversationAnalysisService.analyzeAgentInteraction(
            conversation._id,
            agentId,
            assignmentHistory.contextSummary,
            agentLanguage
        );

        // Update assignment history with release info and AI analysis
        assignmentHistory.releasedAt = releaseTime;
        assignmentHistory.calculateDuration();
        assignmentHistory.releaseReason = reason || 'manual';
        assignmentHistory.releaseMethod = 'manual';
        assignmentHistory.finalStatus = conversation.status;
        
        assignmentHistory.agentSummary = {
            messagesSent: agentMessages,
            issueResolved: aiAnalysis.issueResolution?.wasResolved,
            resolutionNotes: reason,
            followUpRequired: aiAnalysis.actionItems?.followUpRequired
        };

        assignmentHistory.aiAnalysis = {
            ...aiAnalysis,
            analyzedAt: new Date(),
            analysisModel: 'gpt-4o-mini'
        };

        await assignmentHistory.save();
        console.log(`✅ Assignment history updated with AI analysis: ${assignmentHistory._id}`);

        // Update conversation with AI insights
        if (aiAnalysis.conversationQuality?.overallQuality) {
            conversation.tags = [...new Set([
                ...(conversation.tags || []),
                ...aiAnalysis.tags
            ])];
        }
    } else {
        console.warn('⚠️ No active assignment history found for this conversation');
    }

    // Update conversation - REOPEN IT when returning to AI
    conversation.assignedAgent = null;
    conversation.assignedAt = null;
    conversation.isAIEnabled = true;  // Re-enable AI
    conversation.status = 'open';  // Reopen conversation for AI to handle
    conversation.closedAt = null;  // Clear closed timestamp
    conversation.resolvedBy = null;  // Clear resolved by
    conversation.resolvedAt = null;  // Clear resolved timestamp
    conversation.resolutionNotes = reason || 'Conversation returned to AI';

    // Add internal note
    if (!conversation.internalNotes) {
        conversation.internalNotes = [];
    }
    conversation.internalNotes.push({
        agent: agentId,
        content: `Agent released conversation back to AI. Reason: ${reason || 'Not specified'}`,
        timestamp: new Date(),
        isVisible: false
    });

    await conversation.save();

    // Update agent statistics
    agent.statistics.activeAssignments = Math.max(0, agent.statistics.activeAssignments - 1);
    await agent.save();

    // Emit socket events
    io.to(`agent_${agentId}`).emit('conversation_released', {
        conversationId
    });

    io.emit('agent_assignment_update', {
        agentId: previousAgent,
        conversationId,
        action: 'released'
    });

    console.log(`✅ Conversation ${conversationId} released from agent ${agentId}`);

    return { conversation };
}

/**
 * Transfer conversation to another agent
 */
async function transferConversation(conversationId, fromAgentId, toAgentId, reason = null) {
    // Release from current agent
    await releaseConversation(conversationId, fromAgentId, reason);

    // Assign to new agent
    return await assignConversationToAgent(conversationId, toAgentId, fromAgentId);
}

module.exports = {
    getAvailableAgents,
    autoAssignConversation,
    assignConversationToAgent,
    releaseConversation,
    transferConversation
};
