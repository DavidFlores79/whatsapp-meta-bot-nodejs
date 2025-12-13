const Conversation = require('../models/Conversation');
const Customer = require('../models/Customer');
const CRMSettings = require('../models/CRMSettings');

/**
 * Check and escalate conversation priority based on rules
 */
async function checkAndEscalate(conversationId) {
    const settings = await CRMSettings.getSettings();

    if (!settings.priorityEscalation.enabled) {
        return null;
    }

    const conversation = await Conversation.findById(conversationId).populate('customerId');
    if (!conversation || conversation.status === 'closed') {
        return null;
    }

    let shouldEscalate = false;
    let newPriority = conversation.priority;
    let escalationReason = '';
    let triggeredBy = 'system';

    // Check wait time escalation
    if (conversation.status === 'assigned' && conversation.assignedAt) {
        const waitTime = Date.now() - conversation.assignedAt.getTime();
        if (waitTime > settings.priorityEscalation.waitTimeThreshold && conversation.priority !== 'urgent') {
            shouldEscalate = true;
            newPriority = conversation.priority === 'low' ? 'medium' : 'high';
            escalationReason = `Wait time exceeded threshold (${Math.round(waitTime / 60000)} minutes)`;
            triggeredBy = 'wait_time';
        }
    }

    // Check VIP escalation
    if (settings.priorityEscalation.vipAutoEscalate &&
        conversation.customerId?.segment === 'vip' &&
        conversation.priority === 'medium') {
        shouldEscalate = true;
        newPriority = 'high';
        escalationReason = 'VIP customer auto-escalation';
        triggeredBy = 'vip';
    }

    // Escalate if needed
    if (shouldEscalate) {
        return await escalateConversation(conversationId, newPriority, escalationReason, triggeredBy);
    }

    return null;
}

/**
 * Check message content for escalation keywords
 */
async function checkMessageForEscalation(conversationId, messageContent) {
    const settings = await CRMSettings.getSettings();

    if (!settings.priorityEscalation.enabled || !messageContent) {
        return null;
    }

    const conversation = await Conversation.findById(conversationId);
    if (!conversation || conversation.status === 'closed') {
        return null;
    }

    const lowerContent = messageContent.toLowerCase();
    let newPriority = null;
    let escalationReason = '';
    let triggeredBy = 'keyword';

    // Check urgent keywords
    for (const keyword of settings.priorityEscalation.urgentKeywords) {
        if (lowerContent.includes(keyword.toLowerCase())) {
            if (conversation.priority !== 'urgent') {
                newPriority = 'urgent';
                escalationReason = `Urgent keyword detected: "${keyword}"`;
                break;
            }
        }
    }

    // Check high priority keywords (if not already urgent)
    if (!newPriority && conversation.priority !== 'urgent' && conversation.priority !== 'high') {
        for (const keyword of settings.priorityEscalation.highKeywords) {
            if (lowerContent.includes(keyword.toLowerCase())) {
                newPriority = 'high';
                escalationReason = `High priority keyword detected: "${keyword}"`;
                break;
            }
        }
    }

    // Escalate if keyword matched
    if (newPriority) {
        return await escalateConversation(conversationId, newPriority, escalationReason, triggeredBy);
    }

    return null;
}

/**
 * Escalate conversation to new priority level
 */
async function escalateConversation(conversationId, newPriority, reason, triggeredBy = 'system') {
    const { io } = require('../models/server');

    const conversation = await Conversation.findById(conversationId);
    if (!conversation) {
        throw new Error('Conversation not found');
    }

    const oldPriority = conversation.priority;

    // Don't downgrade priority
    const priorityOrder = { low: 0, medium: 1, high: 2, urgent: 3 };
    if (priorityOrder[newPriority] <= priorityOrder[oldPriority]) {
        return null;
    }

    // Update priority
    conversation.priority = newPriority;

    // Track escalation history
    if (!conversation.priorityHistory) {
        conversation.priorityHistory = [];
    }
    conversation.priorityHistory.push({
        from: oldPriority,
        to: newPriority,
        reason,
        timestamp: new Date(),
        triggeredBy
    });

    await conversation.save();

    // Emit socket event
    io.emit('conversation_escalated', {
        conversationId,
        oldPriority,
        newPriority,
        reason
    });

    console.log(`⬆️ Conversation ${conversationId} escalated: ${oldPriority} → ${newPriority} (${reason})`);

    return {
        conversation,
        escalation: {
            from: oldPriority,
            to: newPriority,
            reason,
            triggeredBy
        }
    };
}

/**
 * Manually set conversation priority (agent/supervisor)
 */
async function setConversationPriority(conversationId, newPriority, agentId, reason = null) {
    const Agent = require('../models/Agent');
    const agent = await Agent.findById(agentId);

    if (!agent) {
        throw new Error('Agent not found');
    }

    return await escalateConversation(
        conversationId,
        newPriority,
        reason || `Manually set by ${agent.role} ${agent.email}`,
        'agent'
    );
}

/**
 * Background job to check all active conversations for escalation
 */
async function checkAllConversationsForEscalation() {
    try {
        const activeConversations = await Conversation.find({
            status: { $in: ['open', 'assigned', 'waiting'] }
        });

        let escalatedCount = 0;
        for (const conversation of activeConversations) {
            const result = await checkAndEscalate(conversation._id);
            if (result) {
                escalatedCount++;
            }
        }

        if (escalatedCount > 0) {
            console.log(`⬆️ Escalated ${escalatedCount} conversations based on rules`);
        }

        return escalatedCount;
    } catch (error) {
        console.error('Error in escalation check:', error);
        return 0;
    }
}

module.exports = {
    checkAndEscalate,
    checkMessageForEscalation,
    escalateConversation,
    setConversationPriority,
    checkAllConversationsForEscalation
};
