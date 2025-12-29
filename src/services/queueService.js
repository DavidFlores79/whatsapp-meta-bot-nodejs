/**
 * Message Queue Service
 * 
 * Handles burst detection and message batching for WhatsApp bot.
 * When a user sends multiple messages quickly, they are queued and
 * processed together as one context to the AI assistant.
 */

const openaiService = require("./openaiService");
const whatsappService = require("./whatsappService");
const { buildTextJSON } = require("../shared/whatsappModels");
const Conversation = require("../models/Conversation");
const Message = require("../models/Message");
const Customer = require("../models/Customer");
const Ticket = require("../models/Ticket");
const { io } = require("../models/server");

// Message queue configuration
const QUEUE_WAIT_TIME = 2000; // 2 seconds - wait for burst to complete
const userQueues = new Map(); // userId -> array of messages
const queueTimers = new Map(); // userId -> timer id

/**
 * Add message to user's queue (with burst detection)
 * @param {string} userId - User phone number
 * @param {string} messageText - Message content
 * @param {string} messageId - WhatsApp message ID
 * @param {string} messageType - Message type (text, image, etc)
 * @param {object} messageObject - Full message object from WhatsApp
 * @returns {boolean} - True if queued, false if user is already being processed
 */
function queueUserMessage(userId, messageText, messageId, messageType, messageObject, conversationId, customerId) {
  // Get or create queue for this user
  if (!userQueues.has(userId)) {
    userQueues.set(userId, []);
  }

  // Add message to queue
  userQueues.get(userId).push({
    text: messageText,
    id: messageId,
    type: messageType,
    object: messageObject,
    timestamp: new Date(),
    conversationId: conversationId,
    customerId: customerId
  });

  console.log(`📥 Message queued for ${userId}. Queue size: ${userQueues.get(userId).length}`);

  // Clear existing timer (reset the wait window)
  if (queueTimers.has(userId)) {
    clearTimeout(queueTimers.get(userId));
  }

  // Set new timer - process queue after QUEUE_WAIT_TIME of no new messages
  const timer = setTimeout(() => {
    processUserQueue(userId);
  }, QUEUE_WAIT_TIME);

  queueTimers.set(userId, timer);

  console.log(`⏱️  Timer set - Will process queue in ${QUEUE_WAIT_TIME}ms if no new messages arrive`);
}

/**
 * Process all queued messages for a user
 * @param {string} userId - User phone number
 */
async function processUserQueue(userId) {
  const messagesToProcess = userQueues.get(userId);
  if (!messagesToProcess || messagesToProcess.length === 0) {
    return;
  }

  console.log(`\n🚀 PROCESSING QUEUE for ${userId} - ${messagesToProcess.length} message(s)`);

  try {
    // Get conversationId from first message
    const conversationId = messagesToProcess[0].conversationId;

    // CHECK IF CONVERSATION IS ASSIGNED TO AN AGENT
    const conversation = await Conversation.findById(conversationId)
      .populate('assignedAgent');

    // Combine all text messages into one context
    const combinedText = messagesToProcess
      .map(msg => msg.text)
      .filter(text => text) // Remove undefined/null
      .join('\n\n'); // Separate with double newline

    console.log(`📝 Combined message (${combinedText.length} chars):`);
    console.log(`   "${combinedText.substring(0, 100)}${combinedText.length > 100 ? '...' : ''}"`);

    // CHECK FOR RECENTLY RESOLVED TICKETS - Auto-reopen if customer responds
    await checkAndReopenResolvedTickets(conversationId, messagesToProcess[0].customerId, combinedText);

    // If assigned to agent, route to agent instead of AI
    if (conversation && conversation.assignedAgent && !conversation.isAIEnabled) {
      console.log(`📨 Conversation assigned to agent ${conversation.assignedAgent.email} - Routing to agent`);

      // Emit to specific agent via socket
      io.to(`agent_${conversation.assignedAgent._id}`).emit('customer_message', {
        conversationId: conversation._id,
        customerId: messagesToProcess[0].customerId,
        customerPhone: userId,
        message: combinedText,
        messageCount: messagesToProcess.length,
        timestamp: new Date()
      });

      // Save messages to database
      for (const msg of messagesToProcess) {
        const newMessage = new Message({
          conversationId: msg.conversationId,
          customerId: msg.customerId,
          content: msg.text,
          type: msg.type || 'text',
          direction: 'inbound',
          sender: 'customer',
          whatsappMessageId: msg.id,
          status: 'delivered'
        });
        await newMessage.save();

        // Message already sent to agent via customer_message event above
        // No need to emit new_message here
      }

      // Update conversation stats
      await Conversation.findByIdAndUpdate(conversationId, {
        $inc: { messageCount: messagesToProcess.length, unreadCount: messagesToProcess.length },
        lastCustomerMessage: new Date(),
        lastMessage: {
          content: combinedText,
          timestamp: new Date(),
          from: 'customer',
          type: 'text'
        }
      });

      console.log(`✅ Messages routed to agent ${conversation.assignedAgent.email}`);

      // Clear queue
      userQueues.delete(userId);
      return; // Exit early - message routed to agent
    }

    // ============================================
    // AI PROCESSING (when NOT assigned to agent)
    // ============================================
    console.log(`🤖 Processing with AI...`);

    // Save messages first
    for (const msg of messagesToProcess) {
      const newMessage = new Message({
        conversationId: msg.conversationId,
        customerId: msg.customerId,
        content: msg.text,
        type: msg.type || 'text',
        direction: 'inbound',
        sender: 'customer',
        whatsappMessageId: msg.id,
        status: 'delivered'
      });
      await newMessage.save();

      // Emit customer message to frontend
      io.emit('new_message', {
        chatId: conversationId,
        message: {
          id: newMessage._id.toString(),
          text: newMessage.content,
          sender: 'other',
          timestamp: newMessage.timestamp
        }
      });
    }

    // Update conversation
    await Conversation.findByIdAndUpdate(conversationId, {
      $inc: { messageCount: messagesToProcess.length, unreadCount: messagesToProcess.length },
      lastCustomerMessage: new Date(),
      lastMessage: {
        content: combinedText,
        timestamp: new Date(),
        from: 'customer',
        type: 'text'
      }
    });

    // CHECK FOR TAKEOVER TRIGGERS BEFORE AI PROCESSING
    // This detects if customer requested human help (e.g., "hablar con humano")
    const takeoverSuggestionService = require('./takeoverSuggestionService');
    const takeoverResult = await takeoverSuggestionService.analyzeForTakeover(conversationId, combinedText, null);
    
    // If auto-assigned to agent, stop AI processing
    if (takeoverResult && takeoverResult.autoAssigned) {
      console.log(`🛑 Conversation auto-assigned to human - Skipping AI response`);
      
      // Emit messages to the newly assigned agent
      const updatedConversation = await Conversation.findById(conversationId).populate('assignedAgent');
      if (updatedConversation?.assignedAgent) {
        io.to(`agent_${updatedConversation.assignedAgent._id}`).emit('customer_message', {
          conversationId: conversationId,
          customerId: messagesToProcess[0].customerId,
          customerPhone: userId,
          message: combinedText,
          messageCount: messagesToProcess.length,
          timestamp: new Date()
        });
      }
      
      // Clear queue and exit - human agent will respond
      userQueues.delete(userId);
      return;
    }

    // CONTINUE WITH AI PROCESSING
    // Show typing indicator
    const lastMessageId = messagesToProcess[messagesToProcess.length - 1].id;
    whatsappService.sendTypingIndicator(lastMessageId, "text");

    // Send combined message to OpenAI
    console.log(`🤖 Calling OpenAI Assistant with combined context...`);
    const startTime = Date.now();
    const aiReply = await openaiService.getAIResponse(combinedText, userId, {}, conversationId);
    const duration = ((Date.now() - startTime) / 1000).toFixed(2);

    console.log(`🤖 OpenAI response received in ${duration}s (length: ${aiReply.length} chars)`);

    // Send response to WhatsApp
    const replyPayload = buildTextJSON(userId, aiReply);
    whatsappService.sendWhatsappResponse(replyPayload);

    console.log(`✅ Single AI response sent to ${userId} for ${messagesToProcess.length} message(s)`);
    console.log(`🔓 Queue processing finished for ${userId}\n`);

    // Update conversation stats
    if (conversationId) {
      try {
        await Conversation.findByIdAndUpdate(conversationId, {
          $inc: { messageCount: 1 },
          lastAgentResponse: new Date(),
          lastMessage: {
            content: aiReply,
            timestamp: new Date(),
            from: 'agent', // or 'ai'
            type: 'text'
          }
        });
      } catch (err) {
        console.error("Error updating conversation stats:", err);
      }
    }

    // NOTE: User messages are already saved in whatsappController.js before calling handlers
    // No need to save them again here - this was causing duplicate messages

    // Save AI response to history
    try {
      const customerId = messagesToProcess[0].customerId;
      const aiMessage = new Message({
        conversationId: conversationId,
        customerId: customerId,
        content: aiReply,
        type: 'text',
        direction: 'outbound',
        sender: 'ai',
        status: 'sent'
      });
      await aiMessage.save();

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
    } catch (dbError) {
      console.error("Error saving AI response to DB:", dbError);
    }

  } catch (err) {
    console.error(`❌ Error processing queue for ${userId}:`, err);

    // Send error message to user
    const errorPayload = buildTextJSON(userId, "Lo siento, tuve un problema procesando tu mensaje. ¿Podrías intentarlo de nuevo?");
    whatsappService.sendWhatsappResponse(errorPayload);
  } finally {
    // Clean up
    userQueues.delete(userId);
    queueTimers.delete(userId);
  }
}

/**
 * Check for recently resolved tickets and auto-reopen if customer responds
 * @param {string} conversationId - Conversation ID
 * @param {string} customerId - Customer ID
 * @param {string} messageText - Customer's message
 */
async function checkAndReopenResolvedTickets(conversationId, customerId, messageText) {
  try {
    // Find resolved tickets from the last 48 hours
    const twoDaysAgo = new Date(Date.now() - 48 * 60 * 60 * 1000);

    const resolvedTickets = await Ticket.find({
      conversationId: conversationId,
      customerId: customerId,
      status: 'resolved',
      'resolution.resolvedAt': { $gte: twoDaysAgo }
    })
      .populate('customerId', 'firstName lastName phoneNumber')
      .sort({ 'resolution.resolvedAt': -1 });

    if (resolvedTickets.length === 0) {
      return; // No recently resolved tickets
    }

    // Auto-reopen the most recent resolved ticket
    const ticketToReopen = resolvedTickets[0];

    console.log(`🔄 Auto-reopening ticket ${ticketToReopen.ticketId} - Customer responded after resolution`);

    // Update ticket status to open
    ticketToReopen.status = 'open';

    // Add note about auto-reopen
    if (!ticketToReopen.notes) {
      ticketToReopen.notes = [];
    }
    ticketToReopen.notes.push({
      content: `Ticket automáticamente reabierto. Cliente respondió: "${messageText.substring(0, 100)}${messageText.length > 100 ? '...' : ''}"`,
      agent: null,
      isInternal: true,
      timestamp: new Date()
    });

    await ticketToReopen.save();

    // Populate and emit Socket.io event
    const populatedTicket = await Ticket.findById(ticketToReopen._id)
      .populate('customerId', 'firstName lastName phoneNumber')
      .populate('assignedAgent', 'firstName lastName email')
      .populate('resolution.resolvedBy', 'firstName lastName')
      .populate('notes.agent', 'firstName lastName');

    if (io) {
      io.emit('ticket_status_changed', {
        ticket: populatedTicket,
        previousStatus: 'resolved'
      });
    }

    // Send notification to customer
    const customer = ticketToReopen.customerId;
    const configService = require('./configurationService');
    const configData = await configService.getAssistantConfig();
    const companyName = configData.companyName || process.env.COMPANY_NAME || 'LUXFREE';

    const reopenMessage = `🔄 *Ticket Reabierto*

Hola ${customer.firstName},

Tu ticket *${ticketToReopen.ticketId}* ha sido reabierto ya que detectamos que aún necesitas ayuda.

Un agente revisará tu mensaje y te responderá pronto.

Gracias por tu paciencia.
- Equipo ${companyName}`;

    const messagePayload = buildTextJSON(customer.phoneNumber, reopenMessage);
    await whatsappService.sendWhatsappResponse(messagePayload);

    console.log(`✅ Ticket ${ticketToReopen.ticketId} auto-reopened and notification sent`);
  } catch (error) {
    console.error('❌ Error checking/reopening resolved tickets:', error);
    // Don't throw - this shouldn't break message processing
  }
}

/**
 * Get queue statistics
 * @returns {object} - Queue statistics
 */
function getQueueStats() {
  return {
    activeQueues: userQueues.size,
    queues: Array.from(userQueues.entries()).map(([userId, messages]) => ({
      userId,
      messageCount: messages.length
    }))
  };
}

/**
 * Clear all queues (useful for testing/cleanup)
 */
function clearAllQueues() {
  for (const timer of queueTimers.values()) {
    clearTimeout(timer);
  }
  userQueues.clear();
  queueTimers.clear();
  console.log('🧹 Cleared all message queues');
}

module.exports = {
  queueUserMessage,
  processUserQueue,
  getQueueStats,
  clearAllQueues,
  QUEUE_WAIT_TIME
};
