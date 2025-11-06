const whatsappService = require("../services/whatsappService");
const deduplicationService = require("../services/deduplicationService");
const messageHandlers = require("../handlers/messageHandlers");
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
    switch (messageType) {
      case "text":
        await messageHandlers.handleTextMessage(messageObject, userPhoneNumber);
        break;

      case "interactive":
        await messageHandlers.handleInteractiveMessage(messageObject, userPhoneNumber);
        break;

      case "button":
        await messageHandlers.handleButtonMessage(messageObject, userPhoneNumber);
        break;

      case "image":
        await messageHandlers.handleImageMessage(messageObject, userPhoneNumber);
        break;

      case "location":
        await messageHandlers.handleLocationMessage(messageObject, userPhoneNumber);
        break;

      default:
        messageHandlers.handleUnknownMessage(messageType, messageObject);
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

module.exports = {
  verifyToken,
  receivedMessage,
  sendTemplateData,
  cleanupUserThread,
};
