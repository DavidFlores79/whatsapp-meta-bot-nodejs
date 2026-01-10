const whatsappService = require('./whatsappService');
const {
    buildTextJSON,
    buildImageJSON,
    buildDocumentJSON,
    buildVideoJSON,
    buildAudioJSON
} = require('../shared/whatsappModels');
const Message = require('../models/Message');
const Conversation = require('../models/Conversation');
const Customer = require('../models/Customer');
const Agent = require('../models/Agent');

/**
 * Detect if incoming WhatsApp message is from an agent
 *
 * This requires agents to have their WhatsApp numbers registered in the Agent model
 */
async function detectAgentMessage(phoneNumber) {
    // Check if the phone number belongs to an agent
    const agent = await Agent.findOne({
        phoneNumber: phoneNumber,
        isActive: true
    });

    return agent;
}

/**
 * Handle agent message from WhatsApp (relay to customer)
 *
 * Format: Agents send messages like "REPLY 52123456789: Your message here"
 */
async function handleAgentWhatsAppMessage(agent, messageObject, phoneNumber) {
    const messageText = messageObject.text.body;

    // Parse message format: "REPLY <customer_phone>: <message>"
    const replyPattern = /^REPLY\s+(\d+):\s*(.+)$/is;
    const match = messageText.match(replyPattern);

    if (!match) {
        // Not a valid relay message, send help text
        const helpText = `Formato correcto para responder:\nREPLY <teléfono_cliente>: Tu mensaje aquí\n\nEjemplo:\nREPLY 52123456789: Hola, ¿en qué puedo ayudarte?`;
        const replyPayload = buildTextJSON(phoneNumber, helpText);
        whatsappService.sendWhatsappResponse(replyPayload);
        return;
    }

    const customerPhone = match[1];
    const agentMessage = match[2].trim();

    // Find customer and conversation
    const customer = await Customer.findOne({ phoneNumber: customerPhone });

    if (!customer) {
        const errorText = `Cliente ${customerPhone} no encontrado.`;
        const replyPayload = buildTextJSON(phoneNumber, errorText);
        whatsappService.sendWhatsappResponse(replyPayload);
        return;
    }

    const conversation = await Conversation.findOne({
        customerId: customer._id,
        status: { $in: ['open', 'assigned', 'waiting'] },
        assignedAgent: agent._id
    });

    if (!conversation) {
        const errorText = `No tienes una conversación activa con ${customerPhone}.`;
        const replyPayload = buildTextJSON(phoneNumber, errorText);
        whatsappService.sendWhatsappResponse(replyPayload);
        return;
    }

    // Send message to customer
    await sendAgentMessageToCustomer(
        conversation._id,
        customer._id,
        agent._id,
        customerPhone,
        agentMessage,
        'whatsapp'
    );

    // Confirm to agent
    const confirmText = `✅ Mensaje enviado a ${customer.firstName || customerPhone}`;
    const confirmPayload = buildTextJSON(phoneNumber, confirmText);
    whatsappService.sendWhatsappResponse(confirmPayload);
}

/**
 * Send agent message to customer (from Web UI or WhatsApp)
 */
async function sendAgentMessageToCustomer(conversationId, customerId, agentId, customerPhone, messageText, source = 'web') {
    const { io } = require('../models/server');

    // Send via WhatsApp
    const replyPayload = buildTextJSON(customerPhone, messageText);
    whatsappService.sendWhatsappResponse(replyPayload);

    // Save to database
    const newMessage = new Message({
        conversationId,
        customerId,
        content: messageText,
        type: 'text',
        direction: 'outbound',
        sender: 'agent',
        agentId,
        status: 'sent'
    });
    await newMessage.save();

    // Update conversation
    await Conversation.findByIdAndUpdate(conversationId, {
        $inc: { messageCount: 1 },
        lastAgentResponse: new Date(),
        lastMessage: {
            content: messageText,
            timestamp: new Date(),
            from: 'agent',
            type: 'text'
        },
        unreadCount: 0  // Reset unread for agent
    });

    // Update agent statistics
    await Agent.findByIdAndUpdate(agentId, {
        $inc: { 'statistics.totalMessages': 1 },
        lastActivity: new Date()
    });

    // Emit socket event
    io.emit('new_message', {
        chatId: conversationId.toString(),
        message: {
            id: newMessage._id.toString(),
            text: newMessage.content,
            sender: 'me',
            timestamp: newMessage.timestamp,
            agentId: agentId.toString()
        }
    });

    // Emit to other agents for real-time updates
    io.emit('agent_message_sent', {
        conversationId,
        agentId,
        messageText,
        source
    });

    console.log(`✅ Agent message sent to customer ${customerPhone} (source: ${source})`);

    return newMessage;
}

/**
 * Send media message from agent to customer
 * @param {string} conversationId - Conversation ID
 * @param {string} customerId - Customer ID
 * @param {string} agentId - Agent ID
 * @param {string} customerPhone - Customer phone number
 * @param {Buffer} fileBuffer - File buffer
 * @param {string} filename - Original filename
 * @param {string} mimeType - MIME type (e.g., 'image/jpeg', 'application/pdf')
 * @param {string} caption - Optional caption
 * @param {string} source - Source ('web' or 'whatsapp')
 */
async function sendMediaMessageToCustomer(conversationId, customerId, agentId, customerPhone, fileBuffer, filename, mimeType, caption = '', source = 'web') {
    const { io } = require('../models/server');

    // Determine media type
    const mediaType = whatsappService.getMediaTypeFromMime(mimeType);

    // Upload media to WhatsApp
    const mediaId = await whatsappService.uploadMedia(fileBuffer, mimeType, filename);

    // Build and send the appropriate message type
    let mediaPayload;
    switch (mediaType) {
        case 'image':
            mediaPayload = buildImageJSON(customerPhone, mediaId, caption);
            break;
        case 'video':
            mediaPayload = buildVideoJSON(customerPhone, mediaId, caption);
            break;
        case 'audio':
            mediaPayload = buildAudioJSON(customerPhone, mediaId);
            break;
        default:
            mediaPayload = buildDocumentJSON(customerPhone, mediaId, filename, caption);
    }

    whatsappService.sendWhatsappResponse(mediaPayload);

    // Build content description for database
    const contentDescription = caption || `[${mediaType}: ${filename}]`;

    // Save to database
    const newMessage = new Message({
        conversationId,
        customerId,
        content: contentDescription,
        type: mediaType,
        direction: 'outbound',
        sender: 'agent',
        agentId,
        status: 'sent',
        media: {
            type: mediaType,
            filename: filename,
            mimeType: mimeType,
            whatsappMediaId: mediaId,
            caption: caption
        }
    });
    await newMessage.save();

    // Update conversation
    await Conversation.findByIdAndUpdate(conversationId, {
        $inc: { messageCount: 1 },
        lastAgentResponse: new Date(),
        lastMessage: {
            content: contentDescription,
            timestamp: new Date(),
            from: 'agent',
            type: mediaType
        },
        unreadCount: 0
    });

    // Update agent statistics
    await Agent.findByIdAndUpdate(agentId, {
        $inc: { 'statistics.totalMessages': 1 },
        lastActivity: new Date()
    });

    // Emit socket event
    io.emit('new_message', {
        chatId: conversationId.toString(),
        message: {
            id: newMessage._id.toString(),
            text: contentDescription,
            sender: 'me',
            timestamp: newMessage.timestamp,
            agentId: agentId.toString(),
            type: mediaType,
            media: {
                type: mediaType,
                filename: filename,
                mimeType: mimeType
            }
        }
    });

    // Emit to other agents for real-time updates
    io.emit('agent_message_sent', {
        conversationId,
        agentId,
        messageText: contentDescription,
        mediaType,
        source
    });

    console.log(`✅ Agent ${mediaType} message sent to customer ${customerPhone} (source: ${source})`);

    return newMessage;
}

module.exports = {
    detectAgentMessage,
    handleAgentWhatsAppMessage,
    sendAgentMessageToCustomer,
    sendMediaMessageToCustomer
};
