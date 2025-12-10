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
function queueUserMessage(userId, messageText, messageId, messageType, messageObject, conversationId) {
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
    conversationId: conversationId
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

    // Get conversationId from first message
    const conversationId = messagesToProcess[0].conversationId;

    // Send combined message to OpenAI
    console.log(`🤖 Calling OpenAI Assistant with combined context...`);
    const startTime = Date.now();
    const aiReply = await openaiService.getAIResponse(combinedText, userId, {}, conversationId);
    const duration = ((Date.now() - startTime) / 1000).toFixed(2);

    console.log(`🤖 OpenAI response received in ${duration}s (length: ${aiReply.length} chars)`);

    // Send response to WhatsApp
    await whatsappService.sendMessage(userId, aiReply);

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

    // Save user messages to history and emit socket events
    for (const msg of messagesToProcess) {
      try {
        const newMessage = new Message({
          conversationId: msg.conversationId,
          sender: 'user',
          content: msg.text,
          timestamp: msg.timestamp,
          metadata: { whatsappMessageId: msg.id, type: msg.type }
        });
        await newMessage.save();

        io.emit('new_message', {
          chatId: userId,
          message: {
            id: newMessage._id.toString(),
            text: newMessage.content,
            sender: 'other',
            timestamp: newMessage.timestamp
          }
        });
      } catch (dbError) {
        console.error("Error saving user message to DB:", dbError);
      }
    }

    // Save AI response to history
    try {
      const aiMessage = new Message({
        conversationId: conversationId,
        sender: 'agent',
        content: aiReply,
        timestamp: new Date(),
        metadata: { type: 'text' }
      });
      await aiMessage.save();

      io.emit('new_message', {
        chatId: userId,
        message: {
          id: aiMessage._id.toString(),
          text: aiMessage.content,
          sender: 'self',
          timestamp: aiMessage.timestamp
        }
      });
    } catch (dbError) {
      console.error("Error saving AI response to DB:", dbError);
    }

  } catch (err) {
    console.error(`❌ Error processing queue for ${userId}:`, err);

    // Send error message to user
    await whatsappService.sendMessage(userId, "Lo siento, tuve un problema procesando tu mensaje. ¿Podrías intentarlo de nuevo?");
  } finally {
    // Clean up
    userQueues.delete(userId);
    queueTimers.delete(userId);
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
