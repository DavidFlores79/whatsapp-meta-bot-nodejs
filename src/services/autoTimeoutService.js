const Conversation = require('../models/Conversation');
const Agent = require('../models/Agent');
const AgentAssignmentHistory = require('../models/AgentAssignmentHistory');
const Message = require('../models/Message');

// Configuration
const INACTIVITY_TIMEOUT = 15 * 60 * 1000; // 15 minutes in milliseconds
const CHECK_INTERVAL = 2 * 60 * 1000; // Check every 2 minutes

let timeoutCheckInterval = null;

/**
 * Start the auto-timeout check background job
 */
function startAutoTimeoutService() {
    if (timeoutCheckInterval) {
        console.log('⚠️  Auto-timeout service already running');
        return;
    }

    console.log('🚀 Starting auto-timeout service...');

    // Run immediately on start
    checkInactiveConversations();

    // Then run periodically
    timeoutCheckInterval = setInterval(checkInactiveConversations, CHECK_INTERVAL);

    console.log(`✅ Auto-timeout service started (checking every ${CHECK_INTERVAL / 1000}s)`);
}

/**
 * Stop the auto-timeout service
 */
function stopAutoTimeoutService() {
    if (timeoutCheckInterval) {
        clearInterval(timeoutCheckInterval);
        timeoutCheckInterval = null;
        console.log('🛑 Auto-timeout service stopped');
    }
}

/**
 * Check for inactive conversations and release them
 */
async function checkInactiveConversations() {
    try {
        const now = new Date();
        const timeoutThreshold = new Date(now - INACTIVITY_TIMEOUT);

        // Find conversations assigned to agents with no recent activity
        const inactiveConversations = await Conversation.find({
            assignedAgent: { $ne: null },
            status: 'assigned',
            lastAgentResponse: { $lt: timeoutThreshold }
        }).populate('assignedAgent customerId');

        console.log(`🔍 Checking for inactive conversations... Found: ${inactiveConversations.length}`);

        for (const conversation of inactiveConversations) {
            // Double-check with agent's last activity
            const agent = conversation.assignedAgent;

            if (!agent) continue;

            const agentInactive = agent.lastActivity < timeoutThreshold;
            const conversationInactive =
                !conversation.lastAgentResponse ||
                conversation.lastAgentResponse < timeoutThreshold;

            if (agentInactive || conversationInactive) {
                await resumeAIForConversation(conversation, agent);
            }
        }
    } catch (error) {
        console.error('❌ Error in auto-timeout check:', error);
    }
}

/**
 * Resume AI for a specific conversation
 */
async function resumeAIForConversation(conversation, agent) {
    try {
        const { io } = require('../models/server');
        const previousAgent = agent;

        // Update conversation
        const releaseTime = new Date();

        // Find active assignment history record
        const assignmentHistory = await AgentAssignmentHistory.findOne({
            conversationId: conversation._id,
            agentId: agent._id,
            releasedAt: null // Still active
        }).sort({ assignedAt: -1 });

        if (assignmentHistory) {
            // Calculate agent metrics
            const agentMessages = await Message.countDocuments({
                conversationId: conversation._id,
                sender: 'agent',
                agentId: agent._id,
                timestamp: { $gte: assignmentHistory.assignedAt }
            });

            // Update assignment history with auto-timeout info
            assignmentHistory.releasedAt = releaseTime;
            assignmentHistory.calculateDuration();
            assignmentHistory.releaseReason = 'auto_timeout_inactivity';
            assignmentHistory.releaseMethod = 'timeout';
            assignmentHistory.finalStatus = 'open'; // Reopened for AI
            
            assignmentHistory.agentSummary = {
                messagesSent: agentMessages,
                issueResolved: false,
                resolutionNotes: `Auto-released due to agent inactivity (${INACTIVITY_TIMEOUT / 60000} minutes)`,
                followUpRequired: true // Likely needs follow-up since agent was inactive
            };

            await assignmentHistory.save();
            console.log(`✅ Assignment history updated for auto-timeout: ${assignmentHistory._id}`);
        } else {
            console.warn('⚠️ No active assignment history found for auto-timeout');
        }

        conversation.assignedAgent = null;
        conversation.assignedAt = null;
        conversation.isAIEnabled = true;
        conversation.status = 'open';

        // Add internal note
        if (!conversation.internalNotes) {
            conversation.internalNotes = [];
        }
        conversation.internalNotes.push({
            agent: agent._id,
            content: `AI resumed due to agent inactivity (${INACTIVITY_TIMEOUT / 60000} minutes)`,
            timestamp: new Date(),
            isVisible: false
        });

        await conversation.save();

        // Update agent statistics
        agent.statistics.activeAssignments = Math.max(0, agent.statistics.activeAssignments - 1);
        await agent.save();

        // Emit socket events
        io.to(`agent_${agent._id}`).emit('ai_resumed', {
            conversationId: conversation._id,
            reason: 'inactivity_timeout',
            timeout: INACTIVITY_TIMEOUT / 60000 // in minutes
        });

        io.emit('agent_assignment_update', {
            agentId: agent._id,
            conversationId: conversation._id,
            action: 'ai_resumed'
        });

        console.log(`🤖 AI resumed for conversation ${conversation._id} (agent ${agent.email} inactive)`);

        return { success: true, conversation };
    } catch (error) {
        console.error(`❌ Error resuming AI for conversation ${conversation._id}:`, error);
        return { success: false, error: error.message };
    }
}

/**
 * Manually resume AI for a conversation (skip timeout)
 */
async function manualResumeAI(conversationId, agentId) {
    const conversation = await Conversation.findById(conversationId)
        .populate('assignedAgent');

    if (!conversation) {
        throw new Error('Conversation not found');
    }

    if (!conversation.assignedAgent || conversation.assignedAgent._id.toString() !== agentId.toString()) {
        throw new Error('Conversation not assigned to this agent');
    }

    return await resumeAIForConversation(conversation, conversation.assignedAgent);
}

/**
 * Get timeout configuration
 */
function getTimeoutConfig() {
    return {
        inactivityTimeout: INACTIVITY_TIMEOUT,
        checkInterval: CHECK_INTERVAL,
        isRunning: !!timeoutCheckInterval
    };
}

module.exports = {
    startAutoTimeoutService,
    stopAutoTimeoutService,
    checkInactiveConversations,
    manualResumeAI,
    getTimeoutConfig
};
