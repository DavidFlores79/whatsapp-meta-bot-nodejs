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

// Message queue configuration
const QUEUE_WAIT_TIME = 2000; // 2 seconds - wait for burst to complete
const userMessageQueues = new Map(); // userId -> { messages: [], timer: timeoutId, processing: false }

/**
 * Add message to user's queue (with burst detection)
 * @param {string} userId - User phone number
 * @param {string} messageText - Message content
 * @param {string} messageId - WhatsApp message ID
 * @param {string} messageType - Message type (text, image, etc)
 * @param {object} messageObject - Full message object from WhatsApp
 * @returns {boolean} - True if queued, false if user is already being processed
 */
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

/**
 * Process all queued messages for a user
 * @param {string} userId - User phone number
 */
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
    const replyPayload = buildTextJSON(userId, aiReply);
    whatsappService.sendWhatsappResponse(replyPayload);
    
    console.log(`✅ Single AI response sent to ${userId} for ${messagesToProcess.length} message(s)`);
    console.log(`🔓 Queue processing finished for ${userId}\n`);

  } catch (err) {
    console.error(`❌ Error processing queue for ${userId}:`, err);
    
    // Send error message
    const errorPayload = buildTextJSON(
      userId,
      "Lo siento, ocurrió un error al procesar tus mensajes. Por favor intenta de nuevo."
    );
    whatsappService.sendWhatsappResponse(errorPayload);
  } finally {
    // Clean up queue
    userMessageQueues.delete(userId);
  }
}

/**
 * Get queue statistics
 * @returns {object} - Queue statistics
 */
function getQueueStats() {
  return {
    activeQueues: userMessageQueues.size,
    queues: Array.from(userMessageQueues.entries()).map(([userId, queue]) => ({
      userId,
      messageCount: queue.messages.length,
      processing: queue.processing,
      hasTimer: queue.timer !== null
    }))
  };
}

/**
 * Clear all queues (useful for testing/cleanup)
 */
function clearAllQueues() {
  for (const [userId, queue] of userMessageQueues.entries()) {
    if (queue.timer) {
      clearTimeout(queue.timer);
    }
  }
  userMessageQueues.clear();
  console.log('🧹 Cleared all message queues');
}

module.exports = {
  queueUserMessage,
  processUserQueue,
  getQueueStats,
  clearAllQueues,
  QUEUE_WAIT_TIME
};
