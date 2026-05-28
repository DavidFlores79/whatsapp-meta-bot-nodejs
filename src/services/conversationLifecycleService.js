const Conversation = require('../models/Conversation');
const Agent = require('../models/Agent');
const Customer = require('../models/Customer');
const AgentAssignmentHistory = require('../models/AgentAssignmentHistory');
const Message = require('../models/Message');
const CRMSettings = require('../models/CRMSettings');
const whatsappService = require('./whatsappService');
const { buildInteractiveButtonJSON } = require('../shared/whatsappModels');

/**
 * Mark conversation as resolved
 * Sends confirmation to customer if enabled in settings
 */
async function resolveConversation(conversationId, agentId, resolutionNotes = null) {
    const { io } = require('../models/server');

    const conversation = await Conversation.findById(conversationId).populate('customerId');
    if (!conversation) {
        throw new Error('Conversation not found');
    }

    if (conversation.assignedAgent?.toString() !== agentId.toString()) {
        throw new Error('Conversation not assigned to this agent');
    }

    const settings = await CRMSettings.getSettings();
    const agent = await Agent.findById(agentId);

    // Update conversation status
    conversation.status = 'resolved';
    conversation.resolvedAt = new Date();
    conversation.resolvedBy = agentId;
    conversation.resolutionNotes = resolutionNotes || 'Resolved by agent';

    // Calculate SLA for resolution
    if (conversation.sla && conversation.sla.resolutionTarget) {
        const resolutionTime = Date.now() - conversation.createdAt.getTime();
        conversation.sla.resolutionMet = resolutionTime <= conversation.sla.resolutionTarget;
    }

    // Add internal note
    if (!conversation.internalNotes) {
        conversation.internalNotes = [];
    }
    conversation.internalNotes.push({
        agent: agentId,
        content: `Conversation marked as resolved. Notes: ${resolutionNotes || 'None'}`,
        timestamp: new Date(),
        isVisible: false
    });

    await conversation.save();

    // Send resolution confirmation to customer if enabled
    if (settings.resolutionConfirmation.enabled && conversation.customerId) {
        try {
            const phoneNumber = conversation.customerId.phoneNumber;
            const message = settings.resolutionConfirmation.messageTemplate;

            // Build interactive buttons
            const buttonData = buildInteractiveButtonJSON(
                phoneNumber,
                message,
                [
                    { id: `confirm_resolved_${conversationId}`, title: 'Sí, resuelto' },
                    { id: `not_resolved_${conversationId}`, title: 'No, necesito ayuda' }
                ]
            );

            await whatsappService.sendWhatsappResponse(buttonData);
            conversation.resolutionConfirmationSent = true;
            await conversation.save();

            console.log(`✅ Resolution confirmation sent to ${phoneNumber}`);
        } catch (error) {
            console.error('Failed to send resolution confirmation:', error);
        }
    }

    // Emit socket event
    io.emit('conversation_updated', {
        conversationId,
        status: 'resolved',
        resolvedBy: agent.email
    });

    console.log(`✅ Conversation ${conversationId} marked as resolved by agent ${agentId}`);

    return { conversation, confirmationSent: conversation.resolutionConfirmationSent };
}

/**
 * Close conversation (final state)
 * Can only close resolved conversations or by admin
 */
async function closeConversation(conversationId, agentId, reason = null, force = false) {
    const { io } = require('../models/server');

    const conversation = await Conversation.findById(conversationId);
    if (!conversation) {
        throw new Error('Conversation not found');
    }

    const agent = await Agent.findById(agentId);
    if (!agent) {
        throw new Error('Agent not found');
    }

    // Only allow closing resolved conversations unless forced (admin)
    if (conversation.status !== 'resolved' && !force && agent.role !== 'admin') {
        throw new Error('Can only close resolved conversations. Mark as resolved first.');
    }

    // If forcing close from non-resolved state, mark as resolved first
    if (conversation.status !== 'resolved') {
        conversation.resolvedAt = new Date();
        conversation.resolvedBy = agentId;
    }

    const releaseTime = new Date();
    const wasAssigned = conversation.assignedAgent;

    // Update assignment history if agent was assigned
    if (wasAssigned) {
        const assignmentHistory = await AgentAssignmentHistory.findOne({
            conversationId: conversation._id,
            agentId: wasAssigned,
            releasedAt: null
        }).sort({ assignedAt: -1 });

        if (assignmentHistory) {
            const agentMessages = await Message.countDocuments({
                conversationId: conversation._id,
                sender: 'agent',
                agentId: wasAssigned,
                timestamp: { $gte: assignmentHistory.assignedAt }
            });

            assignmentHistory.releasedAt = releaseTime;
            assignmentHistory.calculateDuration();
            assignmentHistory.releaseReason = 'conversation_closed';
            assignmentHistory.releaseMethod = force ? 'forced_close' : 'normal_close';
            assignmentHistory.finalStatus = 'closed';
            
            assignmentHistory.agentSummary = {
                messagesSent: agentMessages,
                issueResolved: conversation.status === 'resolved',
                resolutionNotes: reason || 'Conversation closed',
                followUpRequired: false
            };

            await assignmentHistory.save();
            console.log(`✅ Assignment history updated for conversation close: ${assignmentHistory._id}`);
        }
    }

    // Update to closed status
    conversation.status = 'closed';
    conversation.closedAt = new Date();
    conversation.assignedAgent = null;  // Release agent
    conversation.assignedAt = null;
    conversation.isAIEnabled = false;   // Disable AI for closed conversations

    // Add internal note
    if (!conversation.internalNotes) {
        conversation.internalNotes = [];
    }
    conversation.internalNotes.push({
        agent: agentId,
        content: `Conversation closed. Reason: ${reason || 'Not specified'}${force ? ' (forced)' : ''}`,
        timestamp: new Date(),
        isVisible: false
    });

    await conversation.save();

    // Update agent statistics if was assigned
    if (wasAssigned) {
        await Agent.findByIdAndUpdate(
            wasAssigned,
            { $inc: { 'statistics.activeAssignments': -1 } }
        );
    }

    // Emit socket event
    io.emit('conversation_updated', {
        conversationId,
        status: 'closed',
        closedBy: agent.email
    });

    console.log(`✅ Conversation ${conversationId} closed by agent ${agentId}`);

    return { conversation };
}

/**
 * Reopen closed conversation
 * Admin/Supervisor only
 */
async function reopenConversation(conversationId, agentId, reason = null) {
    const { io } = require('../models/server');

    const agent = await Agent.findById(agentId);
    if (!agent) {
        throw new Error('Agent not found');
    }

    // Only admin/supervisor can reopen
    if (agent.role !== 'admin' && agent.role !== 'supervisor') {
        throw new Error('Only admins and supervisors can reopen conversations');
    }

    const conversation = await Conversation.findById(conversationId);
    if (!conversation) {
        throw new Error('Conversation not found');
    }

    if (conversation.status !== 'closed') {
        throw new Error('Can only reopen closed conversations');
    }

    // Reopen conversation
    conversation.status = 'open';
    conversation.closedAt = null;
    conversation.resolvedAt = null;
    conversation.resolvedBy = null;
    conversation.isAIEnabled = true;  // Re-enable AI
    conversation.resolutionConfirmationSent = false;

    // Add internal note
    if (!conversation.internalNotes) {
        conversation.internalNotes = [];
    }
    conversation.internalNotes.push({
        agent: agentId,
        content: `Conversation reopened by ${agent.role}. Reason: ${reason || 'Not specified'}`,
        timestamp: new Date(),
        isVisible: false
    });

    await conversation.save();

    // Emit socket event
    io.emit('conversation_updated', {
        conversationId,
        status: 'open',
        reopenedBy: agent.email
    });

    console.log(`✅ Conversation ${conversationId} reopened by ${agent.role} ${agentId}`);

    return { conversation };
}

/**
 * Handle resolution confirmation from customer
 */
async function handleResolutionConfirmation(conversationId, confirmed) {
    const settings = await CRMSettings.getSettings();
    const conversation = await Conversation.findById(conversationId);

    if (!conversation) {
        throw new Error('Conversation not found');
    }

    if (confirmed) {
        // Customer confirmed resolution
        conversation.resolutionConfirmedAt = new Date();
        conversation.resolutionConfirmedBy = 'customer';

        // Auto-close if enabled
        if (settings.resolutionConfirmation.autoCloseOnConfirm) {
            conversation.status = 'closed';
            conversation.closedAt = new Date();
            conversation.isAIEnabled = false;
        }

        await conversation.save();

        console.log(`✅ Customer confirmed resolution for conversation ${conversationId}`);
        return { conversation, message: 'Gracias por confirmar. ¡Que tengas un excelente día!' };
    } else {
        // Customer says not resolved - close current assignment and reassign
        const wasAssigned = conversation.assignedAgent;
        const releaseTime = new Date();

        // Close current assignment history if agent was assigned
        if (wasAssigned) {
            const assignmentHistory = await AgentAssignmentHistory.findOne({
                conversationId: conversation._id,
                agentId: wasAssigned,
                releasedAt: null
            }).sort({ assignedAt: -1 });

            if (assignmentHistory) {
                const agentMessages = await Message.countDocuments({
                    conversationId: conversation._id,
                    sender: 'agent',
                    agentId: wasAssigned,
                    timestamp: { $gte: assignmentHistory.assignedAt }
                });

                assignmentHistory.releasedAt = releaseTime;
                assignmentHistory.calculateDuration();
                assignmentHistory.releaseReason = 'customer_not_resolved';
                assignmentHistory.releaseMethod = 'customer_feedback';
                assignmentHistory.finalStatus = 'assigned'; // Will be reassigned
                
                assignmentHistory.agentSummary = {
                    messagesSent: agentMessages,
                    issueResolved: false,
                    resolutionNotes: 'Customer reported issue not resolved',
                    followUpRequired: true
                };

                await assignmentHistory.save();
                console.log(`✅ Assignment history closed for customer not-resolved: ${assignmentHistory._id}`);
            }

            // Update agent statistics
            await Agent.findByIdAndUpdate(
                wasAssigned,
                { $inc: { 'statistics.activeAssignments': -1 } }
            );
        }

        // Update conversation status
        conversation.status = 'open'; // Set to open for auto-assignment
        conversation.assignedAgent = null;
        conversation.assignedAt = null;
        conversation.resolvedAt = null;
        conversation.resolvedBy = null;
        conversation.resolutionConfirmationSent = false;

        // Increment reassignment count and check for escalation
        conversation.reassignmentCount = (conversation.reassignmentCount || 0) + 1;

        // Auto-escalate if threshold reached
        if (settings.priorityEscalation.enabled &&
            conversation.reassignmentCount >= settings.priorityEscalation.reassignmentThreshold) {
            const oldPriority = conversation.priority;
            conversation.priority = 'urgent';

            if (!conversation.priorityHistory) {
                conversation.priorityHistory = [];
            }
            conversation.priorityHistory.push({
                from: oldPriority,
                to: 'urgent',
                reason: `Reassignment threshold reached (${conversation.reassignmentCount} reassignments)`,
                timestamp: new Date(),
                triggeredBy: 'reassignment'
            });

            console.log(`⬆️ Conversation ${conversationId} escalated to urgent due to reassignments`);
        }

        // Add internal note
        if (!conversation.internalNotes) {
            conversation.internalNotes = [];
        }
        conversation.internalNotes.push({
            agent: wasAssigned,
            content: `Customer reported issue not resolved. Conversation returned to queue.`,
            timestamp: new Date(),
            isVisible: false
        });

        await conversation.save();

        // Try to auto-assign to available agent
        const agentAssignmentService = require('./agentAssignmentService');
        const assignmentResult = await agentAssignmentService.autoAssignConversation(conversationId);

        if (assignmentResult) {
            console.log(`✅ Conversation ${conversationId} auto-assigned after customer not-resolved`);
        } else {
            console.log(`⚠️ No available agents. Conversation ${conversationId} returned to open queue`);
        }

        console.log(`⚠️ Customer reported issue not resolved for conversation ${conversationId}`);
        return { conversation, message: 'Entendido. Un agente se pondrá en contacto contigo pronto.' };
    }
}

module.exports = {
    resolveConversation,
    closeConversation,
    reopenConversation,
    handleResolutionConfirmation
};
