/**
 * Message Deduplication Service
 * 
 * Prevents duplicate processing of the same WhatsApp message.
 * WhatsApp may send duplicate webhooks if server doesn't respond in time.
 */

// Message cache configuration
const MESSAGE_CACHE_TTL = 5 * 60 * 1000; // 5 minutes
const processedMessages = new Map(); // messageId -> timestamp

// Cleanup interval reference
let cleanupIntervalId = null;

/**
 * Check if message was already processed
 * @param {string} messageId - WhatsApp message ID
 * @returns {boolean} - True if already processed
 */
function isMessageProcessed(messageId) {
  return processedMessages.has(messageId);
}

/**
 * Mark message as processed
 * @param {string} messageId - WhatsApp message ID
 */
function markMessageAsProcessed(messageId) {
  processedMessages.set(messageId, Date.now());
  console.log(`✅ NEW MESSAGE - Added ${messageId} to cache`);
}

/**
 * Start automatic cleanup interval
 * Removes expired message IDs from cache every minute
 */
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
  }, 60 * 1000); // Run every minute
  
  // Cleanup on process exit
  process.on('SIGTERM', stopCleanupInterval);
  process.on('SIGINT', stopCleanupInterval);
  
  console.log('🚀 Started message deduplication cleanup interval');
}

/**
 * Stop cleanup interval
 */
function stopCleanupInterval() {
  if (cleanupIntervalId) {
    clearInterval(cleanupIntervalId);
    cleanupIntervalId = null;
    console.log('🛑 Stopped message deduplication cleanup interval');
  }
}

/**
 * Get cache statistics
 * @returns {object} - Cache statistics
 */
function getCacheStats() {
  return {
    totalMessages: processedMessages.size,
    cacheTTL: MESSAGE_CACHE_TTL,
    oldestMessage: processedMessages.size > 0 
      ? Math.min(...Array.from(processedMessages.values()))
      : null
  };
}

/**
 * Clear all cached message IDs (useful for testing)
 */
function clearCache() {
  processedMessages.clear();
  console.log('🧹 Cleared message deduplication cache');
}

// Auto-start cleanup on module load
startCleanupInterval();

module.exports = {
  isMessageProcessed,
  markMessageAsProcessed,
  getCacheStats,
  clearCache,
  startCleanupInterval,
  stopCleanupInterval
};
