const whatsappService = require("../services/whatsappService");
const deduplicationService = require("../services/deduplicationService");
const messageHandlers = require("../handlers/messageHandlers");
const Customer = require("../models/Customer");
const Conversation = require("../models/Conversation");
const Message = require("../models/Message");
// const { io } = require("../models/server"); // Using req.io instead
const { getTemplateData, formatNumber } = require("../shared/processMessage");
const openaiService = require("../services/openaiService");

const ADMIN = process.env.WHATSAPP_ADMIN;

/**
 * Verify WhatsApp webhook token
 */
const verifyToken = (req, res) => {
  try {
    const accessToken = process.env.WHATSAPP_ACCESS_TOKEN;
    const token = req.query["hub.verify_token"];
    const challenge = req.query["hub.challenge"];

    console.log({ accessToken, token, challenge });

    if (challenge != null && token != null && accessToken == token) {
      return res.status(200).send(challenge);
    }

    return res.status(400).send({ msg: "El Token no está presente. Validar." });
  } catch (error) {
    return res.status(400).send();
  }
};

/**
 * Receive and process WhatsApp webhook messages
 */
const receivedMessage = async (req, res) => {
  try {
    const { entry } = req.body;
    req.io.emit("incoming_messages", req.body);

    if (!entry) {
      console.log("******** NO ENTRY ********", req.body);
      return res.send("EVENT_RECEIVED");
    }

    const { changes } = entry[0];
    const { value } = changes[0];
    const { messages } = value;

    if (!messages) {
      console.log("******** SERVER STATUS UPDATE ********");
      console.log(JSON.stringify(changes[0]));
      return res.send("EVENT_RECEIVED");
    }

    const messageObject = messages[0];
    const messageType = messageObject.type;
    const messageId = messageObject.id;

    // Format phone number early for all checks
    let userPhoneNumber = messageObject.from;
    if (userPhoneNumber.length === 13) {
      userPhoneNumber = formatNumber(userPhoneNumber);
    }

    // Log incoming webhook
    console.log(`\n🔔 [${new Date().toISOString()}] NEW WEBHOOK RECEIVED`);
    console.log(`   Message ID: ${messageId}`);
    console.log(`   Message Type: ${messageType}`);
    console.log(`   From: ${userPhoneNumber}`);
    if (messageType === 'text') {
      console.log(`   Text: "${messageObject.text.body}"`);
    }
    console.log(`   Cache size: ${deduplicationService.getCacheStats().totalMessages} messages`);

    // ============================================
    // DEDUPLICATION CHECK
    // ============================================
    if (deduplicationService.isMessageProcessed(messageId)) {
      console.log(`⚠️  DUPLICATE DETECTED - Message ${messageId} already processed - SKIPPING\n`);
      return res.send("EVENT_RECEIVED");
    }

    // Mark as processed IMMEDIATELY to prevent race conditions
    deduplicationService.markMessageAsProcessed(messageId);

    // ============================================
    // RESPOND TO WEBHOOK IMMEDIATELY
    // ============================================
    // WhatsApp expects response within 5 seconds
    res.send("EVENT_RECEIVED");
    console.log(`📤 Webhook response sent to WhatsApp (EVENT_RECEIVED)\n`);

    // ============================================
    // ROUTE TO MESSAGE HANDLERS
    // ============================================
    // Find or create customer
    let customer = await Customer.findOne({ phoneNumber: userPhoneNumber });
    const userName = value.contacts && value.contacts[0] && value.contacts[0].profile ? value.contacts[0].profile.name : userPhoneNumber;
    if (!customer) {
      customer = await Customer.create({
        phoneNumber: userPhoneNumber,
        firstName: userName,
        firstContact: new Date(),
        lastInteraction: new Date()
      });
    } else {
      customer.lastInteraction = new Date();
      await customer.save();
    }

    // ============================================
    // CHECK IF MESSAGE IS FROM AN AGENT
    // ============================================
    const agentMessageRelayService = require('../services/agentMessageRelayService');
    const agent = await agentMessageRelayService.detectAgentMessage(userPhoneNumber);

    if (agent) {
      console.log(`📨 Message from agent ${agent.email} - Processing as agent relay`);
      await agentMessageRelayService.handleAgentWhatsAppMessage(agent, messageObject, userPhoneNumber);
      return; // Don't process as customer message
    }

    // Find or create active conversation
    let conversation = await Conversation.findOne({
      customerId: customer._id,
      status: { $in: ['open', 'assigned', 'waiting'] }
    });

    if (!conversation) {
      conversation = await Conversation.create({
        customerId: customer._id,
        status: 'open',
        channel: 'whatsapp',
        source: 'inbound_message'
      });

      // Update customer stats
      customer.statistics.totalConversations = (customer.statistics.totalConversations || 0) + 1;
      await customer.save();
    }

    // Create message record
    const newMessage = await Message.create({
      conversationId: conversation._id,
      customerId: customer._id,
      content: messageType === 'text' ? messageObject.text.body : `[${messageType}]`,
      type: messageType,
      direction: 'inbound',
      sender: 'customer',
      whatsappMessageId: messageId,
      whatsappTimestamp: new Date(parseInt(req.body.entry[0].changes[0].value.messages[0].timestamp) * 1000),
      status: 'delivered'
    });

    // Update conversation stats
    conversation.lastMessage = {
      content: newMessage.content,
      timestamp: newMessage.timestamp,
      from: 'customer',
      type: messageType
    };
    conversation.messageCount += 1;
    conversation.unreadCount += 1;
    conversation.lastCustomerMessage = new Date();
    await conversation.save();

    // Emit socket event
    req.io.emit('new_message', {
      chatId: conversation._id.toString(),
      message: {
        id: newMessage._id.toString(),
        text: newMessage.content,
        sender: 'other',
        timestamp: newMessage.timestamp
      }
    });

    // Route to message handlers (pass conversation context)
    switch (messageType) {
      case "text":
        await messageHandlers.handleTextMessage(messageObject, userPhoneNumber, conversation._id, customer._id);
        break;

      case "interactive":
        await messageHandlers.handleInteractiveMessage(messageObject, userPhoneNumber, conversation._id);
        break;

      case "button":
        await messageHandlers.handleButtonMessage(messageObject, userPhoneNumber, conversation._id);
        break;

      case "image":
        await messageHandlers.handleImageMessage(messageObject, userPhoneNumber, conversation._id);
        break;

      case "location":
        await messageHandlers.handleLocationMessage(messageObject, userPhoneNumber, conversation._id);
        break;

      default:
        console.log(`Unhandled message type: ${messageType}`);
        break;
    }

  } catch (error) {
    console.error("❌ Error in receivedMessage handler:", error);
    // If we haven't responded yet, respond now
    if (!res.headersSent) {
      return res.send("EVENT_RECEIVED");
    }
  }
};

/**
 * Send WhatsApp template message
 */
const sendTemplateData = async (req, res) => {
  const { data } = req.body;
  const { number, template_name, parameters, language } = data;

  console.log({ number, template_name, parameters, language });

  try {
    let templateData = getTemplateData(
      number,
      template_name,
      parameters,
      language
    );
    whatsappService.sendWhatsappResponse(templateData);

    return res.send({ msg: "Template Enviado correctamente.", data });
  } catch (error) {
    return res.status(400).send({ msg: error, data });
  }
};

/**
 * Cleanup user thread (manual endpoint)
 */
const cleanupUserThread = async (req, res) => {
  try {
    const { userId } = req.body;

    if (!userId) {
      return res.status(400).send({
        msg: "userId is required",
        success: false
      });
    }

    const result = await openaiService.cleanupUserThread(userId);

    if (result) {
      return res.send({
        msg: `Thread cleanup completed for user ${userId}`,
        success: true
      });
    } else {
      return res.status(404).send({
        msg: `No thread found for user ${userId}`,
        success: false
      });
    }
  } catch (error) {
    console.error("Error in cleanupUserThread:", error);
    return res.status(500).send({
      msg: "Error cleaning up thread",
      error: error.message,
      success: false
    });
  }
};

/**
 * Get all conversations with customer details
 */
const getConversations = async (req, res) => {
  try {
    const conversations = await Conversation.find({})
      .populate('customerId')
      .sort({ lastCustomerMessage: -1 });

    const formattedConversations = conversations.map(conv => ({
      id: conv.customerId.phoneNumber, // Use phone as ID for frontend compatibility
      name: conv.customerId.firstName || conv.customerId.phoneNumber,
      avatar: conv.customerId.avatar || `https://ui-avatars.com/api/?name=${conv.customerId.firstName || 'User'}&background=random`,
      lastMessage: conv.lastMessage?.content || 'No messages',
      lastMessageTime: conv.lastMessage?.timestamp || conv.createdAt,
      unreadCount: conv.unreadCount || 0,
      messages: [] // Messages will be fetched separately or could be populated here
    }));

    res.json(formattedConversations);
  } catch (error) {
    console.error("Error fetching conversations:", error);
    res.status(500).json({ error: "Failed to fetch conversations" });
  }
};

/**
 * Get messages for a specific conversation (by phone number)
 */
const getMessages = async (req, res) => {
  try {
    const { phoneNumber } = req.params;
    const customer = await Customer.findOne({ phoneNumber });

    if (!customer) {
      return res.status(404).json({ error: "Customer not found" });
    }

    const messages = await Message.find({ customerId: customer._id })
      .sort({ timestamp: 1 });

    const formattedMessages = messages.map(msg => ({
      id: msg._id,
      text: msg.content,
      sender: msg.sender === 'customer' ? 'other' : 'me',
      timestamp: msg.timestamp
    }));

    res.json(formattedMessages);
  } catch (error) {
    console.error("Error fetching messages:", error);
    res.status(500).json({ error: "Failed to fetch messages" });
  }
};

module.exports = {
  verifyToken,
  receivedMessage,
  sendTemplateData,
  cleanupUserThread,
  getConversations,
  getMessages
};
