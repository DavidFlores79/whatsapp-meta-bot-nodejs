/**
 * Message Handlers
 * 
 * Handles different types of WhatsApp messages (text, image, location, etc.)
 */

const openaiService = require("../services/openaiService");
const whatsappService = require("../services/whatsappService");
const cloudinaryService = require("../services/cloudinaryService");
const geocodingService = require("../services/geocodingService");
const queueService = require("../services/queueService");
const { buildTextJSON } = require("../shared/whatsappModels");

// Set to store processed message IDs to prevent duplicates
const processedMessages = new Set();

/**
 * Handle text messages
 * @param {object} messageObject - WhatsApp message object
 * @param {string} phoneNumber - User phone number (formatted)
 */
async function handleTextMessage(messageObject, phoneNumber, conversationId, customerId) {
  console.log("📝 TEXT message received");
  const messageId = messageObject.id;
  const messageBody = messageObject.text.body;

  // Check for duplicate messages
  if (processedMessages.has(messageId)) {
    console.log(`Message ${messageId} already processed, skipping.`);
    return;
  }
  processedMessages.add(messageId);
  setTimeout(() => processedMessages.delete(messageId), 60000); // Clear after 1 minute

  const userRequest = messageBody.toLowerCase();

  console.log(`User ${phoneNumber}: "${userRequest}"`);

  // Add to queue (will auto-process after QUEUE_WAIT_TIME)
  queueService.queueUserMessage(
    phoneNumber,
    userRequest,
    messageId,
    "text",
    messageObject,
    conversationId,
    customerId
  );
}

/**
 * Handle image messages
 * @param {object} messageObject - WhatsApp message object
 * @param {string} phoneNumber - User phone number (formatted)
 * @param {string} conversationId - Conversation ID
 * @param {string} customerId - Customer ID
 */
async function handleImageMessage(messageObject, phoneNumber, conversationId, customerId) {
  const Conversation = require('../models/Conversation');
  const Message = require('../models/Message');
  const { io } = require('../models/server');
  
  const imageId = messageObject.image.id;
  const caption = messageObject.image.caption || "";
  const imageMimeType = messageObject.image.mime_type || "";
  const messageId = messageObject.id;

  console.log("📸 IMAGE received - ID:", imageId);
  console.log("   Caption:", caption);
  console.log("   MIME Type:", imageMimeType);

  try {
    // Get the actual media URL from WhatsApp
    const imageUrl = await whatsappService.getMediaUrl(imageId);
    console.log("✅ Retrieved image URL from WhatsApp");

    // Upload to Cloudinary for permanent storage
    const uploadResult = await cloudinaryService.uploadTicketImage(
      imageUrl,
      phoneNumber,
      process.env.WHATSAPP_API_TOKEN
    );

    console.log(`✅ Image uploaded to Cloudinary: ${uploadResult.url}`);

    // Save message to DB with image metadata
    const imageMessage = await Message.create({
      conversationId,
      customerId,
      content: caption || '[Image]',
      type: 'image',
      direction: 'inbound',
      sender: 'customer',
      whatsappMessageId: messageId,
      status: 'delivered',
      attachments: [{
        type: 'image',
        url: uploadResult.url,
        filename: `image_${Date.now()}.jpg`,
        mimeType: imageMimeType,
        thumbnailUrl: uploadResult.url
      }]
    });

    // Update conversation stats
    await Conversation.findByIdAndUpdate(conversationId, {
      $inc: { messageCount: 1, unreadCount: 1 },
      lastCustomerMessage: new Date(),
      lastMessage: {
        content: caption || '📷 Image',
        timestamp: new Date(),
        from: 'customer',
        type: 'image'
      }
    });

    // Check if conversation is assigned to agent
    const conversation = await Conversation.findById(conversationId).populate('assignedAgent');

    if (conversation && conversation.assignedAgent && !conversation.isAIEnabled) {
      console.log(`📨 Image sent to assigned agent ${conversation.assignedAgent.email}`);
      
      // Emit ONLY to assigned agent (not broadcast)
      io.to(`agent_${conversation.assignedAgent._id}`).emit('customer_message', {
        conversationId,
        customerId,
        customerPhone: phoneNumber,
        message: caption || '📷 Image',
        type: 'image',
        attachments: imageMessage.attachments,
        timestamp: new Date()
      });
      
      return; // Don't process with AI - agent is handling
    }
    
    // Broadcast for monitoring (AI is handling)
    io.emit('new_message', {
      chatId: conversationId,
      message: {
        id: imageMessage._id.toString(),
        text: caption || '',
        sender: 'other',
        timestamp: imageMessage.timestamp,
        type: 'image',
        attachments: imageMessage.attachments
      }
    });

    // Process with AI if not assigned
    console.log('🤖 Processing image with AI');
    whatsappService.sendTypingIndicator(messageId, "text");

    // Build message for AI assistant including image context
    let messageForAI = "El usuario ha enviado una imagen.";
    if (caption) {
      messageForAI += ` Descripción de la imagen: "${caption}"`;
    }
    messageForAI += `\n\nURL de la imagen: ${uploadResult.url}`;
    messageForAI += `\n\nSi el usuario está reportando un problema, puedes usar esta imagen como evidencia en el ticket.`;

    // Send to AI assistant with image context
    const aiReply = await openaiService.getAIResponse(
      messageForAI,
      phoneNumber,
      { imageUrl: uploadResult.url, imageCaption: caption },
      conversationId
    );

    // Send AI reply back to user and capture message ID
    const replyPayload = buildTextJSON(phoneNumber, aiReply);
    const { messageId: whatsappMessageId } = await whatsappService.sendWhatsappResponse(replyPayload);

    console.log(`✅ AI response sent to ${phoneNumber} (with image context), whatsappMessageId: ${whatsappMessageId}`);

    // Save AI response to database with WhatsApp message ID
    const aiResponseMessage = await Message.create({
      conversationId,
      customerId,
      content: aiReply,
      type: 'text',
      direction: 'outbound',
      sender: 'ai',
      status: 'sent',
      whatsappMessageId
    });

    // Update conversation stats
    await Conversation.findByIdAndUpdate(conversationId, {
      $inc: { messageCount: 1 },
      lastAgentResponse: new Date(),
      lastMessage: {
        content: aiReply,
        timestamp: new Date(),
        from: 'agent',
        type: 'text'
      }
    });

    // Emit AI response to frontend via Socket.io
    io.emit('new_message', {
      chatId: conversationId,
      message: {
        id: aiResponseMessage._id.toString(),
        text: aiResponseMessage.content,
        sender: 'me',
        isAI: true,
        timestamp: aiResponseMessage.timestamp,
        type: 'text'
      }
    });

    console.log(`✅ AI response saved to database and emitted to frontend\n`);

  } catch (error) {
    console.error("❌ Error processing image:", error);

    // Send error message to user
    const errorReply = "Recibí tu imagen pero hubo un problema al procesarla. Por favor, intenta enviarla nuevamente o descríbeme el problema.";
    const replyPayload = buildTextJSON(phoneNumber, errorReply);
    whatsappService.sendWhatsappResponse(replyPayload);
  }
}

/**
 * Handle location messages
 * @param {object} messageObject - WhatsApp message object
 * @param {string} phoneNumber - User phone number (formatted)
 * @param {string} conversationId - Conversation ID
 * @param {string} customerId - Customer ID
 */
async function handleLocationMessage(messageObject, phoneNumber, conversationId, customerId) {
  const Conversation = require('../models/Conversation');
  const Message = require('../models/Message');
  const { io } = require('../models/server');
  
  const location = messageObject.location;
  const latitude = location.latitude;
  const longitude = location.longitude;
  const locationName = location.name || "";
  const locationAddress = location.address || "";
  const messageId = messageObject.id;

  console.log("📍 LOCATION received:", { latitude, longitude, locationName, locationAddress });

  try {
    // Reverse geocode to get formatted address
    const addressData = await geocodingService.reverseGeocode(latitude, longitude);
    console.log(`✅ Location geocoded: ${addressData.formatted_address}`);

    // Generate Google Maps static map URL for preview
    const mapImageUrl = `https://maps.googleapis.com/maps/api/staticmap?center=${latitude},${longitude}&zoom=15&size=400x300&markers=color:red%7C${latitude},${longitude}&key=${process.env.GOOGLE_MAPS_API_KEY}`;

    // Save message to DB with location metadata
    const locationMessage = await Message.create({
      conversationId,
      customerId,
      content: `[Location] ${addressData.formatted_address}`,
      type: 'location',
      direction: 'inbound',
      sender: 'customer',
      whatsappMessageId: messageId,
      status: 'delivered',
      location: {
        latitude,
        longitude,
        address: addressData.formatted_address,
        name: locationName,
        mapImageUrl: mapImageUrl
      }
    });

    // Update conversation stats
    await Conversation.findByIdAndUpdate(conversationId, {
      $inc: { messageCount: 1, unreadCount: 1 },
      lastCustomerMessage: new Date(),
      lastMessage: {
        content: addressData.formatted_address,
        timestamp: new Date(),
        from: 'customer',
        type: 'location'
      }
    });

    // Check if conversation is assigned to agent
    const conversation = await Conversation.findById(conversationId).populate('assignedAgent');

    if (conversation && conversation.assignedAgent && !conversation.isAIEnabled) {
      console.log(`📨 Location sent to assigned agent ${conversation.assignedAgent.email}`);
      
      // Emit ONLY to assigned agent (not broadcast)
      io.to(`agent_${conversation.assignedAgent._id}`).emit('customer_message', {
        conversationId,
        customerId,
        customerPhone: phoneNumber,
        message: addressData.formatted_address,
        type: 'location',
        location: locationMessage.location,
        timestamp: new Date()
      });
      
      return; // Don't process with AI - agent is handling
    }
    
    // Broadcast for monitoring (AI is handling)
    io.emit('new_message', {
      chatId: conversationId,
      message: {
        id: locationMessage._id.toString(),
        text: addressData.formatted_address,
        sender: 'other',
        timestamp: locationMessage.timestamp,
        type: 'location',
        location: locationMessage.location
      }
    });

    // Process with AI if not assigned
    console.log('🤖 Processing location with AI');
    whatsappService.sendTypingIndicator(messageId, "text");

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
      phoneNumber,
      { location: addressData },
      conversationId
    );

    // Send AI reply back to user and capture message ID
    const replyPayload = buildTextJSON(phoneNumber, aiReply);
    const { messageId: whatsappMessageId } = await whatsappService.sendWhatsappResponse(replyPayload);

    console.log(`✅ AI response sent to ${phoneNumber} (with location context), whatsappMessageId: ${whatsappMessageId}`);

    // Save AI response to database with WhatsApp message ID
    const aiMessage = await Message.create({
      conversationId,
      customerId,
      content: aiReply,
      type: 'text',
      direction: 'outbound',
      sender: 'ai',
      status: 'sent',
      whatsappMessageId
    });

    // Update conversation stats
    await Conversation.findByIdAndUpdate(conversationId, {
      $inc: { messageCount: 1 },
      lastAgentResponse: new Date(),
      lastMessage: {
        content: aiReply,
        timestamp: new Date(),
        from: 'agent',
        type: 'text'
      }
    });

    // Emit AI response to frontend via Socket.io
    io.emit('new_message', {
      chatId: conversationId,
      message: {
        id: aiMessage._id.toString(),
        text: aiMessage.content,
        sender: 'me',
        isAI: true,
        timestamp: aiMessage.timestamp,
        type: 'text'
      }
    });

    console.log(`✅ AI response saved to database and emitted to frontend\n`);

  } catch (error) {
    console.error("❌ Error processing location:", error);

    // Fallback: send basic acknowledgment
    const fallbackReply = `Recibí tu ubicación (${latitude}, ${longitude}). Si estás reportando un problema, por favor confírmame la dirección donde necesitas el servicio.`;
    const replyPayload = buildTextJSON(phoneNumber, fallbackReply);
    whatsappService.sendWhatsappResponse(replyPayload);
  }
}

/**
 * Handle interactive messages (buttons, lists)
 * @param {object} messageObject - WhatsApp message object
 * @param {string} phoneNumber - User phone number (formatted)
 * @param {string} conversationId - Conversation ID
 */
async function handleInteractiveMessage(messageObject, phoneNumber, conversationId) {
  console.log("🔘 INTERACTIVE message received");
  const { interactive, id: messageId, timestamp } = messageObject;
  const { type: interactiveType } = interactive;

  try {
    let messageText = '';
    let interactionData = {};

    // Extract content based on interactive type
    if (interactiveType === 'button_reply') {
      // User clicked a button
      const { id: buttonId, title } = interactive.button_reply;
      messageText = title;
      interactionData = {
        type: 'button_reply',
        buttonId,
        title
      };
      console.log(`   Button clicked: "${title}" (ID: ${buttonId})`);

      // Check if this is a resolution confirmation button
      if (buttonId.startsWith('confirm_resolved_') || buttonId.startsWith('not_resolved_')) {
        const confirmed = buttonId.startsWith('confirm_resolved_');
        const extractedConversationId = buttonId.split('_').pop();

        console.log(`   🔔 Resolution confirmation: ${confirmed ? 'YES' : 'NO'} for conversation ${extractedConversationId}`);

        // Handle resolution confirmation
        const lifecycleService = require('../services/conversationLifecycleService');
        try {
          const result = await lifecycleService.handleResolutionConfirmation(extractedConversationId, confirmed);

          // Send response to customer
          const whatsappService = require('../services/whatsappService');
          const { buildTextJSON } = require('../shared/whatsappModels');
          const responseData = buildTextJSON(phoneNumber, result.message);
          await whatsappService.sendWhatsappResponse(responseData);

          console.log(`   ✅ Resolution confirmation processed and response sent`);
          return; // Don't process this as a regular message
        } catch (error) {
          console.error(`   ❌ Error handling resolution confirmation:`, error);
        }
      }
    } else if (interactiveType === 'list_reply') {
      // User selected from a list
      const { id: listItemId, title, description } = interactive.list_reply;
      messageText = title;
      interactionData = {
        type: 'list_reply',
        listItemId,
        title,
        description
      };
      console.log(`   List item selected: "${title}" (ID: ${listItemId})`);
    } else if (interactiveType === 'nfm_reply') {
      // Flow response (new WhatsApp feature)
      messageText = interactive.nfm_reply?.body || 'Flow response received';
      interactionData = {
        type: 'nfm_reply',
        data: interactive.nfm_reply
      };
      console.log(`   Flow response received`);
    } else {
      // Unknown interactive type
      messageText = `Interactive message: ${interactiveType}`;
      interactionData = {
        type: interactiveType,
        data: interactive
      };
      console.log(`   Unknown interactive type: ${interactiveType}`);
    }

    // Find customer
    const customer = await Customer.findOne({ phoneNumber });
    if (!customer) {
      console.error(`   Customer not found: ${phoneNumber}`);
      return;
    }

    // Create message record in database
    const newMessage = await Message.create({
      messageId,
      conversationId,
      customerId: customer._id,
      sender: 'customer',
      type: 'interactive',
      content: messageText,
      interactive: interactionData,
      timestamp: new Date(parseInt(timestamp) * 1000),
      status: 'delivered'
    });

    // Update conversation
    await Conversation.findByIdAndUpdate(conversationId, {
      lastMessage: {
        content: messageText,
        timestamp: new Date(),
        from: 'customer',
        type: 'interactive'
      },
      lastCustomerMessage: new Date(),
      $inc: { messageCount: 1 }
    });

    // Update customer
    customer.lastInteraction = new Date();
    await customer.save();

    // Emit to frontend via socket
    const { io } = require('../models/server');
    io.emit('new_message', {
      conversationId: conversationId.toString(),
      message: {
        id: newMessage._id.toString(),
        text: messageText,
        sender: 'other',
        timestamp: newMessage.timestamp,
        type: 'interactive',
        interactive: interactionData
      }
    });

    console.log(`   ✅ Interactive message saved and emitted to frontend`);

    // Add to queue for AI processing if AI is enabled
    const conversation = await Conversation.findById(conversationId);
    if (conversation && conversation.isAIEnabled && !conversation.assignedAgent) {
      const queueService = require('../services/queueService');
      await queueService.addMessageToQueue({
        messageId,
        phoneNumber,
        message: messageText,
        messageType: 'interactive',
        conversationId,
        customerId: customer._id,
        timestamp: new Date(parseInt(timestamp) * 1000)
      });
      console.log(`   📋 Added interactive message to AI queue`);
    }

  } catch (error) {
    console.error("❌ Error handling interactive message:", error);
  }
}

/**
 * Handle button messages
 * @param {object} messageObject - WhatsApp message object
 * @param {string} phoneNumber - User phone number (formatted)
 */
async function handleButtonMessage(messageObject, phoneNumber) {
  console.log("🔘 BUTTON message received");

  // TODO: Implement button handling
  console.log("   (Not yet implemented)");
}

/**
 * Handle unknown message types
 * @param {string} messageType - Unknown message type
 * @param {object} messageObject - WhatsApp message object
 */
function handleUnknownMessage(messageType, messageObject) {
  console.log("⚠️ Unknown message type:", messageType);
  console.log({ messageObject });
}

module.exports = {
  handleTextMessage,
  handleImageMessage,
  handleLocationMessage,
  handleInteractiveMessage,
  handleButtonMessage,
  handleUnknownMessage
};
