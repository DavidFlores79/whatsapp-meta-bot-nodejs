const fetch = require("node-fetch");
const openaiService = require("../services/openaiService");
const fs = require("fs");
const whatsappService = require("../services/whatsappService");
const {
  analizeText,
  getTemplateData,
  formatNumber,
} = require("../shared/processMessage");
const ADMIN = process.env.WHATSAPP_ADMIN;

// ============================================
// MESSAGE DEDUPLICATION SYSTEM
// ============================================
// Prevents duplicate processing of the same WhatsApp message
// WhatsApp may send duplicate webhooks if server doesn't respond in time
const processedMessages = new Map();
const MESSAGE_CACHE_TTL = 5 * 60 * 1000; // 5 minutes

// ============================================
// MESSAGE QUEUE SYSTEM (Burst Detection)
// ============================================
// Collects multiple messages from same user in short time window
// Processes them together as ONE conversation context
// Example: User sends "hello" + "my light broke" + "can you help?" → ONE AI response
const userMessageQueues = new Map(); // userId -> { messages: [], timer: timeoutId, processing: false }
const QUEUE_WAIT_TIME = 2000; // Wait 2 seconds for message burst to complete

// Store interval ID for cleanup
let cleanupIntervalId = null;

// Start cleanup interval (with proper cleanup on exit)
function startCleanupInterval() {
  if (cleanupIntervalId) return; // Prevent multiple intervals
  
  cleanupIntervalId = setInterval(() => {
    const now = Date.now();
    let cleaned = 0;
    for (const [messageId, timestamp] of processedMessages.entries()) {
      if (now - timestamp > MESSAGE_CACHE_TTL) {
        processedMessages.delete(messageId);
        cleaned++;
      }
    }
    if (cleaned > 0) {
      console.log(`🧹 Cleaned up ${cleaned} old message IDs from cache`);
    }
  }, 60 * 1000);
  
  // Cleanup on process exit
  process.on('SIGTERM', stopCleanupInterval);
  process.on('SIGINT', stopCleanupInterval);
}

function stopCleanupInterval() {
  if (cleanupIntervalId) {
    clearInterval(cleanupIntervalId);
    cleanupIntervalId = null;
    console.log('🛑 Stopped message deduplication cleanup interval');
  }
}

// Start the interval
startCleanupInterval();

// Check if message was already processed
function isMessageProcessed(messageId) {
  return processedMessages.has(messageId);
}

// Mark message as processed
function markMessageAsProcessed(messageId) {
  processedMessages.set(messageId, Date.now());
}

// Add message to user's queue (with burst detection)
function queueUserMessage(userId, messageText, messageId, messageType, messageObject) {
  // Get or create queue for this user
  if (!userMessageQueues.has(userId)) {
    userMessageQueues.set(userId, {
      messages: [],
      timer: null,
      processing: false
    });
  }

  const queue = userMessageQueues.get(userId);
  
  // If already processing, ignore new messages
  if (queue.processing) {
    console.log(`⏳ PROCESSING - User ${userId} is being processed, ignoring new message`);
    return false;
  }

  // Add message to queue
  queue.messages.push({
    text: messageText,
    id: messageId,
    type: messageType,
    object: messageObject,
    timestamp: Date.now()
  });

  console.log(`📥 QUEUED - Message added to queue for ${userId} (queue size: ${queue.messages.length})`);

  // Clear existing timer (reset the wait window)
  if (queue.timer) {
    clearTimeout(queue.timer);
  }

  // Set new timer - process queue after QUEUE_WAIT_TIME of no new messages
  queue.timer = setTimeout(() => {
    processUserQueue(userId);
  }, QUEUE_WAIT_TIME);

  console.log(`⏱️  Timer set - Will process queue in ${QUEUE_WAIT_TIME}ms if no new messages arrive`);
  return true;
}

// Process all queued messages for a user
async function processUserQueue(userId) {
  const queue = userMessageQueues.get(userId);
  if (!queue || queue.messages.length === 0) {
    return;
  }

  // Mark as processing to prevent new messages during processing
  queue.processing = true;
  const messagesToProcess = [...queue.messages]; // Copy array
  queue.messages = []; // Clear queue

  console.log(`\n🚀 PROCESSING QUEUE for ${userId} - ${messagesToProcess.length} message(s)`);

  try {
    // Combine all text messages into one context
    const combinedText = messagesToProcess
      .map(msg => msg.text)
      .filter(text => text) // Remove undefined/null
      .join('\n\n'); // Separate with double newline

    console.log(`📝 Combined message (${combinedText.length} chars):`);
    console.log(`   "${combinedText.substring(0, 100)}${combinedText.length > 100 ? '...' : ''}"`);

    // Show typing indicator
    const lastMessageId = messagesToProcess[messagesToProcess.length - 1].id;
    whatsappService.sendTypingIndicator(lastMessageId, "text");

    // Get AI response for combined context
    console.log(`🤖 Calling OpenAI Assistant with combined context...`);
    const startTime = Date.now();
    const aiReply = await openaiService.getAIResponse(combinedText, userId);
    const duration = ((Date.now() - startTime) / 1000).toFixed(2);
    
    console.log(`🤖 OpenAI response received in ${duration}s (length: ${aiReply.length} chars)`);

    // Send ONE response for all messages
    const replyPayload = require("../shared/whatsappModels").buildTextJSON(userId, aiReply);
    whatsappService.sendWhatsappResponse(replyPayload);
    
    console.log(`✅ Single AI response sent to ${userId} for ${messagesToProcess.length} message(s)`);
    console.log(`🔓 Queue processing finished for ${userId}\n`);

  } catch (err) {
    console.error(`❌ Error processing queue for ${userId}:`, err);
    
    // Send error message
    const errorPayload = require("../shared/whatsappModels").buildTextJSON(
      userId,
      "Lo siento, ocurrió un error al procesar tus mensajes. Por favor intenta de nuevo."
    );
    whatsappService.sendWhatsappResponse(errorPayload);
  } finally {
    // Clean up queue
    userMessageQueues.delete(userId);
  }
}
// ============================================

const verifyToken = (req, res) => {
  try {
    const accessToken = process.env.WHATSAPP_ACCESS_TOKEN;
    const token = req.query["hub.verify_token"];
    const challenge = req.query["hub.challenge"];

    console.log({ accessToken });
    console.log({ token });
    console.log({ challenge });

    if (challenge != null && token != null && accessToken == token) {
      return res.status(200).send(challenge);
    }

    return res.status(400).send({ msg: "El Token no está presente. Validar." });
  } catch (error) {
    return res.status(400).send();
  }
};

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
    const { messages, errors, statuses, metadata } = value;

    if (!messages) {
      console.log("******** SERVER ********");
      console.log(JSON.stringify(changes[0]));
      return res.send("EVENT_RECEIVED");
    }
    const messageObject = messages[0];
    const messageType = messageObject.type;
    const messageId = messageObject.id;

    // Get user phone number early for all checks
    let userPhoneNumber = messageObject.from;
    if (userPhoneNumber.length === 13) {
      userPhoneNumber = formatNumber(userPhoneNumber);
    }

    console.log(`\n🔔 [${new Date().toISOString()}] NEW WEBHOOK RECEIVED`);
    console.log(`   Message ID: ${messageId}`);
    console.log(`   Message Type: ${messageType}`);
    console.log(`   From: ${userPhoneNumber}`);
    if (messageType === 'text') {
      console.log(`   Text: "${messageObject.text.body}"`);
    }
    console.log(`   Cache size: ${processedMessages.size} messages`);
    console.log(`   Active queues: ${userMessageQueues.size}`);

    // ============================================
    // DEDUPLICATION CHECK
    // ============================================
    // WhatsApp may send duplicate webhook events if server is slow
    // Check if we already processed this exact message
    if (isMessageProcessed(messageId)) {
      console.log(`⚠️  DUPLICATE DETECTED - Message ${messageId} already processed - SKIPPING\n`);
      return res.send("EVENT_RECEIVED");
    }

    // Mark as processed IMMEDIATELY to prevent race conditions
    markMessageAsProcessed(messageId);
    console.log(`✅ NEW MESSAGE - Added ${messageId} to cache`);

    // ============================================
    // RESPOND TO WEBHOOK IMMEDIATELY
    // ============================================
    // WhatsApp expects response within 5 seconds
    // We respond immediately and process asynchronously
    res.send("EVENT_RECEIVED");
    console.log(`📤 Webhook response sent to WhatsApp (EVENT_RECEIVED)\n`);
    // ============================================

    // ============================================
    // QUEUE MESSAGE FOR PROCESSING
    // ============================================
    // Add message to queue with burst detection
    // If user sends multiple messages quickly, they'll be combined into one AI request
    switch (messageType) {
      case "text": {
        console.log("📝 TEXT message received");
        const userRequest = messageObject.text.body;
        const number = userPhoneNumber; // Already formatted above

        console.log(`User ${number}: "${userRequest}"`);

        // Add to queue (will auto-process after QUEUE_WAIT_TIME)
        queueUserMessage(number, userRequest, messageId, messageType, messageObject);
        break;
      }
      case "interactive": {
        console.log("es INTERACTIVE");
        const { type: interactiveType } = messageObject.interactive;
        break;
      }
      //templates
      case "button": {
        console.log("es BUTTON");
        break;
      }
      case "image": {
        const imageId = messageObject.image.id;
        const imageCaption = messageObject.image.caption || "";
        const imageMimeType = messageObject.image.mime_type || "";
        
        console.log("📸 IMAGE received - ID:", imageId);
        console.log("   Caption:", imageCaption);
        console.log("   MIME Type:", imageMimeType);
        
        const number = userPhoneNumber; // Already formatted above

        try {
          // Show typing indicator
          whatsappService.sendTypingIndicator(messageId, "text");

          // Get the actual media URL from WhatsApp
          const imageUrl = await whatsappService.getMediaUrl(imageId);
          console.log("✅ Retrieved image URL from WhatsApp");
          
          // Upload to Cloudinary for permanent storage
          const cloudinaryService = require("../services/cloudinaryService");
          const uploadResult = await cloudinaryService.uploadTicketImage(
            imageUrl,
            number,
            process.env.WHATSAPP_API_TOKEN
          );
          
          console.log(`✅ Image uploaded to Cloudinary: ${uploadResult.url}`);
          
          // Build message for AI assistant including image context
          let messageForAI = "El usuario ha enviado una imagen.";
          if (imageCaption) {
            messageForAI += ` Descripción de la imagen: "${imageCaption}"`;
          }
          messageForAI += `\n\nURL de la imagen: ${uploadResult.url}`;
          messageForAI += `\n\nSi el usuario está reportando un problema, puedes usar esta imagen como evidencia en el ticket.`;
          
          // Send to AI assistant with image context
          const aiReply = await openaiService.getAIResponse(
            messageForAI,
            number,
            { imageUrl: uploadResult.url, imageCaption }
          );
          
          // Send AI reply back to user
          const replyPayload = require("../shared/whatsappModels").buildTextJSON(number, aiReply);
          whatsappService.sendWhatsappResponse(replyPayload);
          
          console.log(`✅ AI response sent to ${number} (with image context)`);
          console.log(`🔓 UNLOCKED - User ${number} finished processing\n`);
          
          // Release user lock
          finishProcessingUser(number);
        } catch (error) {
          console.error("❌ Error processing image:", error);
          
          // Release user lock on error
          finishProcessingUser(number);
          console.log(`🔓 UNLOCKED - User ${number} (error recovery)\n`);
          
          // Send error message to user
          const errorReply = "Recibí tu imagen pero hubo un problema al procesarla. Por favor, intenta enviarla nuevamente o descríbeme el problema.";
          const replyPayload = require("../shared/whatsappModels").buildTextJSON(number, errorReply);
          whatsappService.sendWhatsappResponse(replyPayload);
        }
        
        break;
      }
      case "location": {
        const location = messageObject.location;
        const latitude = location.latitude;
        const longitude = location.longitude;
        const locationName = location.name || "";
        const locationAddress = location.address || "";
        
        console.log("📍 LOCATION received:", { latitude, longitude, locationName, locationAddress });
        
        const number = userPhoneNumber; // Already formatted above

        try {
          // Show typing indicator
          whatsappService.sendTypingIndicator(messageId, "text");

          // Reverse geocode to get formatted address
          const geocodingService = require("../services/geocodingService");
          const addressData = await geocodingService.reverseGeocode(latitude, longitude);
          
          console.log(`✅ Location geocoded: ${addressData.formatted_address}`);
          
          // Build message for AI assistant including location context
          let messageForAI = "El usuario ha enviado su ubicación.\n\n";
          messageForAI += `📍 Dirección: ${addressData.formatted_address}\n`;
          messageForAI += `Coordenadas: ${addressData.coordinates_string}\n`;
          
          if (locationName) {
            messageForAI += `Nombre del lugar: ${locationName}\n`;
          }
          
          if (addressData.city) {
            messageForAI += `Ciudad: ${addressData.city}\n`;
          }
          
          if (addressData.state) {
            messageForAI += `Estado: ${addressData.state}\n`;
          }
          
          messageForAI += `\nSi el usuario está reportando un problema, puedes usar esta ubicación como la dirección del servicio en el ticket.`;
          
          // Send to AI assistant with location context
          const aiReply = await openaiService.getAIResponse(
            messageForAI,
            number,
            { location: addressData }
          );
          
          // Send AI reply back to user
          const replyPayload = require("../shared/whatsappModels").buildTextJSON(number, aiReply);
          whatsappService.sendWhatsappResponse(replyPayload);
          
          console.log(`✅ AI response sent to ${number} (with location context)`);
          console.log(`🔓 UNLOCKED - User ${number} finished processing\n`);
          
          // Release user lock
          finishProcessingUser(number);
        } catch (error) {
          console.error("❌ Error processing location:", error);
          
          // Release user lock on error
          finishProcessingUser(number);
          console.log(`🔓 UNLOCKED - User ${number} (error recovery)\n`);
          
          // Fallback: send basic acknowledgment
          const fallbackReply = `Recibí tu ubicación (${latitude}, ${longitude}). Si estás reportando un problema, por favor confírmame la dirección donde necesitas el servicio.`;
          const replyPayload = require("../shared/whatsappModels").buildTextJSON(number, fallbackReply);
          whatsappService.sendWhatsappResponse(replyPayload);
        }
        
        break;
      }
      default: {
        console.log("⚠️ Unknown message type:", messageType);
        console.log({ messageObject });
        break;
      }
    }
    // Note: We already sent "EVENT_RECEIVED" response earlier
  } catch (error) {
    console.error("❌ Error in receivedMessage handler:", error);
    // If we haven't responded yet, respond now
    if (!res.headersSent) {
      return res.send("EVENT_RECEIVED");
    }
  }
};

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
    // let adminMsg = getTextData(`Se envió el Template ${template_name} al Cel ${number}`, ADMIN);
    // whatsappService.sendWhatsappResponse(adminMsg);

    return res.send({ msg: "Template Enviado correctamente.", data });
  } catch (error) {
    return res.status(400).send({ msg: error, data });
  }
};

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
