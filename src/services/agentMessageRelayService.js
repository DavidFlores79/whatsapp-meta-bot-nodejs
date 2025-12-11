const whatsappService = require('./whatsappService');
const { buildTextJSON } = require('../shared/whatsappModels');
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
        chatId: customerPhone,
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

module.exports = {
    detectAgentMessage,
    handleAgentWhatsAppMessage,
    sendAgentMessageToCustomer
};
