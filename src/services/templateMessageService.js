/**
 * Centralized Template Message Service
 *
 * This service provides a single, consistent way to send WhatsApp template messages.
 * It ensures that:
 * 1. Template is fetched from database to get actual content
 * 2. Display content is generated using getTemplateDisplayContent()
 * 3. Message is saved to database with correct format
 * 4. Socket.io events are emitted for real-time UI updates
 *
 * IMPORTANT: Always use this service when sending templates to ensure
 * the CRM chat bubble displays the same content as WhatsApp.
 */

const Template = require('../models/Template');
const Message = require('../models/Message');
const Conversation = require('../models/Conversation');
const Agent = require('../models/Agent');
const { buildTemplateJSON } = require('../shared/whatsappModels');
const { getTemplateDisplayContent } = require('../shared/processMessage');
const whatsappService = require('./whatsappService');

// Socket.io instance (set by server initialization)
let io = null;

/**
 * Set Socket.io instance for real-time events
 * @param {Object} socketIo - Socket.io server instance
 */
const setSocketIO = (socketIo) => {
    io = socketIo;
};

/**
 * Send a WhatsApp template message with full tracking
 *
 * @param {Object} options - Send options
 * @param {string} options.templateName - Name of the template in database
 * @param {string} options.languageCode - Language code (e.g., 'es_MX', 'en_US')
 * @param {Array} options.parameters - Array of parameter objects [{type: 'text', text: 'value'}]
 * @param {string} options.phoneNumber - Recipient phone number
 * @param {string} options.customerId - MongoDB Customer ID
 * @param {string} options.conversationId - MongoDB Conversation ID
 * @param {string} [options.agentId] - MongoDB Agent ID (if sent by agent)
 * @param {string} [options.sender='agent'] - Message sender type ('agent', 'system')
 * @param {boolean} [options.saveToDatabase=true] - Whether to save message to database
 * @param {boolean} [options.emitSocketEvents=true] - Whether to emit Socket.io events
 *
 * @returns {Promise<Object>} - { message, displayContent, template }
 * @throws {Error} If template not found or send fails
 */
const sendTemplateMessage = async (options) => {
    const {
        templateName,
        languageCode,
        parameters,
        phoneNumber,
        customerId,
        conversationId,
        agentId = null,
        sender = 'agent',
        saveToDatabase = true,
        emitSocketEvents = true
    } = options;

    // 1. Fetch template from database
    const template = await Template.findOne({ name: templateName });
    if (!template) {
        throw new Error(`Template '${templateName}' no encontrado en la base de datos. Asegúrese de sincronizar templates desde Meta.`);
    }

    // 2. Build WhatsApp API payload
    const messagePayload = buildTemplateJSON(
        phoneNumber,
        templateName,
        parameters,
        languageCode
    );

    // 3. Send to WhatsApp and capture message ID
    const { messageId: whatsappMessageId } = await whatsappService.sendWhatsappResponse(messagePayload);

    // 4. Generate display content from actual template
    const parameterValues = parameters.map(p => p.text);
    const displayContent = getTemplateDisplayContent(template, parameterValues);

    let savedMessage = null;

    if (saveToDatabase && conversationId && customerId) {
        // 5. Save message to database
        savedMessage = new Message({
            conversationId,
            customerId,
            content: displayContent,
            type: 'template',
            direction: 'outbound',
            sender,
            agentId,
            status: 'sent',
            whatsappMessageId,
            template: {
                name: templateName,
                language: languageCode,
                parameters: parameterValues,
                category: template.category || 'UTILITY'
            }
        });
        await savedMessage.save();

        // 6. Update conversation
        await Conversation.findByIdAndUpdate(conversationId, {
            $inc: { messageCount: 1 },
            lastMessageAt: new Date(),
            lastAgentResponse: agentId ? new Date() : undefined,
            lastMessage: {
                content: displayContent,
                timestamp: new Date(),
                from: sender,
                type: 'template'
            },
            unreadCount: 0
        });

        // 7. Update agent statistics if agent sent the message
        if (agentId) {
            await Agent.findByIdAndUpdate(agentId, {
                $inc: { 'statistics.totalMessages': 1 },
                lastActivity: new Date()
            });
        }

        // 8. Update template usage count
        await template.incrementUsage();

        // 9. Emit Socket.io events for real-time UI update
        if (emitSocketEvents && io) {
            io.emit('new_message', {
                chatId: conversationId.toString(),
                message: {
                    id: savedMessage._id.toString(),
                    text: displayContent,
                    sender: agentId ? 'me' : 'system',
                    timestamp: savedMessage.timestamp,
                    agentId: agentId?.toString(),
                    type: 'template',
                    template: {
                        name: templateName,
                        language: languageCode
                    }
                }
            });

            if (agentId) {
                io.emit('agent_message_sent', {
                    conversationId,
                    agentId,
                    messageText: displayContent,
                    source: 'web'
                });
            }
        }
    }

    console.log(`📤 Template '${templateName}' sent to ${phoneNumber}`);

    return {
        message: savedMessage,
        displayContent,
        template
    };
};

/**
 * Send a template message without saving to database
 * Useful for notifications to agents/external recipients
 *
 * @param {Object} options - Send options (same as sendTemplateMessage but without DB fields)
 * @returns {Promise<Object>} - { displayContent, template }
 */
const sendTemplateNotification = async (options) => {
    const {
        templateName,
        languageCode,
        parameters,
        phoneNumber
    } = options;

    // Fetch template from database for display content
    const template = await Template.findOne({ name: templateName });
    if (!template) {
        // For notifications, we can proceed without template in DB (just won't have display content)
        console.warn(`⚠️ Template '${templateName}' not found in database. Sending anyway.`);
    }

    // Build WhatsApp API payload
    const messagePayload = buildTemplateJSON(
        phoneNumber,
        templateName,
        parameters,
        languageCode
    );

    // Send to WhatsApp and capture message ID
    const { messageId: whatsappMessageId } = await whatsappService.sendWhatsappResponse(messagePayload);

    // Generate display content if template exists
    let displayContent = null;
    if (template) {
        const parameterValues = parameters.map(p => p.text);
        displayContent = getTemplateDisplayContent(template, parameterValues);
    }

    console.log(`📤 Template notification '${templateName}' sent to ${phoneNumber}`);

    return {
        displayContent,
        template
    };
};

module.exports = {
    setSocketIO,
    sendTemplateMessage,
    sendTemplateNotification
};
