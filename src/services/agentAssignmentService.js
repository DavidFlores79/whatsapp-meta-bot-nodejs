const Agent = require('../models/Agent');
const Conversation = require('../models/Conversation');

/**
 * Get available agents for assignment
 */
async function getAvailableAgents(filters = {}) {
    const query = {
        isActive: true,
        status: { $in: ['online', 'away'] },
        ...filters
    };

    const agents = await Agent.find(query)
        .where('statistics.activeAssignments')
        .lt(20); // Max 20 concurrent chats (using the max value from schema)

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
    const availableAgents = await getAvailableAgents({ autoAssign: true });

    if (availableAgents.length === 0) {
        return null;
    }

    // Simple load balancing: assign to agent with fewest active chats
    const selectedAgent = availableAgents[0];

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

    // Check if agent has capacity
    if (agent.statistics.activeAssignments >= agent.maxConcurrentChats) {
        throw new Error('Agent has reached maximum concurrent chats');
    }

    // Update conversation
    conversation.assignedAgent = agentId;
    conversation.assignedAt = new Date();
    conversation.assignedBy = assignedBy;
    conversation.status = 'assigned';
    conversation.isAIEnabled = false;  // Disable AI when assigned to agent

    await conversation.save();

    // Update agent statistics
    agent.statistics.activeAssignments += 1;
    agent.statistics.totalAssignments += 1;
    await agent.save();

    // Emit socket event to agent
    io.to(`agent_${agentId}`).emit('conversation_assigned', {
        conversationId: conversation._id,
        customerId: conversation.customerId._id,
        customerName: conversation.customerId.firstName || conversation.customerId.phoneNumber,
        customerPhone: conversation.customerId.phoneNumber,
        lastMessage: conversation.lastMessage,
        assignedAt: conversation.assignedAt
    });

    // Emit to all agents (for dashboard updates)
    io.emit('agent_assignment_update', {
        agentId,
        conversationId,
        action: 'assigned'
    });

    console.log(`✅ Conversation ${conversationId} assigned to agent ${agentId}`);

    return {
        conversation,
        agent
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

    const previousAgent = conversation.assignedAgent;

    // Update conversation
    conversation.assignedAgent = null;
    conversation.assignedAt = null;
    conversation.isAIEnabled = true;  // Re-enable AI
    conversation.status = 'open';

    // Add internal note
    if (!conversation.internalNotes) {
        conversation.internalNotes = [];
    }
    conversation.internalNotes.push({
        agent: agentId,
        content: `Agent released conversation. Reason: ${reason || 'Not specified'}`,
        timestamp: new Date(),
        isVisible: false
    });

    await conversation.save();

    // Update agent statistics
    const agent = await Agent.findById(agentId);
    if (agent) {
        agent.statistics.activeAssignments = Math.max(0, agent.statistics.activeAssignments - 1);
        await agent.save();
    }

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
