# Alternative Implementation: Message Queue Pattern

## Overview

This document describes an alternative, more robust approach to handling concurrent message processing using a **queue-based pattern** instead of locks.

## Why Consider This?

### Current Lock-Based Approach:
- ✅ Works well for most cases
- ✅ Simple to understand
- ⚠️ Has small race condition window
- ⚠️ Requires careful timeout management
- ⚠️ Polling-based waiting

### Queue-Based Approach:
- ✅ **Eliminates race conditions** - Natural FIFO ordering
- ✅ **Simpler logic** - No lock management needed
- ✅ **Better observability** - Can see queue depth
- ✅ **Automatic backpressure** - Queue grows if system is slow
- ✅ **Promise-based** - No polling loops

## When to Use This

Consider upgrading to the queue pattern if:
- You're getting race condition issues (very rare)
- You want better observability of message flow
- You're planning to scale to multiple instances (with Redis queue)
- You want cleaner, more maintainable code

For most single-instance bots, the **current lock-based approach is sufficient**.

## Implementation

### File: `src/services/messageQueue.js` (NEW)

```javascript
/**
 * Per-User Message Queue System
 * 
 * Ensures messages for each user are processed sequentially
 * without race conditions or complex locking mechanisms.
 */

const openaiService = require('./openaiService');
const whatsappService = require('./whatsappService');
const { buildTextJSON } = require('../shared/whatsappModels');

// Queue structure: userId -> Array of pending messages
const userQueues = new Map();

// Processing status: userId -> boolean
const processingStatus = new Map();

/**
 * Add message to user's queue and process if not already processing
 */
async function enqueueMessage(userId, message, context = {}) {
  return new Promise((resolve, reject) => {
    // Initialize queue for user if it doesn't exist
    if (!userQueues.has(userId)) {
      userQueues.set(userId, []);
    }

    const queue = userQueues.get(userId);
    
    // Add message to queue with promise resolvers
    queue.push({
      message,
      context,
      resolve,
      reject,
      timestamp: Date.now()
    });

    console.log(`📥 Queued message for user ${userId} (queue depth: ${queue.length})`);

    // If this is the only message in queue, start processing
    if (queue.length === 1 && !processingStatus.get(userId)) {
      processQueue(userId);
    }
  });
}

/**
 * Process all messages in user's queue sequentially
 */
async function processQueue(userId) {
  const queue = userQueues.get(userId);
  if (!queue || queue.length === 0) {
    return;
  }

  // Mark as processing
  processingStatus.set(userId, true);

  try {
    while (queue.length > 0) {
      const item = queue[0]; // Peek at first item
      
      try {
        console.log(`🚀 Processing message for user ${userId} (${queue.length} in queue)`);
        
        // Process with OpenAI
        const aiReply = await openaiService.getAIResponse(
          item.message,
          userId,
          item.context
        );

        // Send response
        const replyPayload = buildTextJSON(userId, aiReply);
        whatsappService.sendWhatsappResponse(replyPayload);

        console.log(`✅ Message processed for user ${userId}`);
        
        // Resolve the promise
        item.resolve(aiReply);
      } catch (error) {
        console.error(`❌ Error processing message for user ${userId}:`, error);
        
        // Send error message to user
        const errorPayload = buildTextJSON(
          userId,
          "Lo siento, ocurrió un error al procesar tu mensaje. Por favor intenta de nuevo."
        );
        whatsappService.sendWhatsappResponse(errorPayload);
        
        // Reject the promise
        item.reject(error);
      } finally {
        // Remove processed item from queue
        queue.shift();
      }
    }
  } finally {
    // Clean up
    processingStatus.delete(userId);
    if (queue.length === 0) {
      userQueues.delete(userId);
    } else {
      // If more messages arrived while processing, continue
      processQueue(userId);
    }
  }
}

/**
 * Get queue depth for a user (useful for monitoring)
 */
function getQueueDepth(userId) {
  const queue = userQueues.get(userId);
  return queue ? queue.length : 0;
}

/**
 * Get total number of queued messages across all users
 */
function getTotalQueueDepth() {
  let total = 0;
  for (const queue of userQueues.values()) {
    total += queue.length;
  }
  return total;
}

/**
 * Get number of users with pending messages
 */
function getActiveUsers() {
  return userQueues.size;
}

/**
 * Clear all queues (useful for maintenance or restart)
 */
function clearAllQueues() {
  const stats = {
    users: userQueues.size,
    messages: getTotalQueueDepth()
  };
  
  // Reject all pending messages
  for (const queue of userQueues.values()) {
    for (const item of queue) {
      item.reject(new Error('Queue cleared'));
    }
  }
  
  userQueues.clear();
  processingStatus.clear();
  
  console.log(`🧹 Cleared all queues: ${stats.users} users, ${stats.messages} messages`);
  return stats;
}

module.exports = {
  enqueueMessage,
  getQueueDepth,
  getTotalQueueDepth,
  getActiveUsers,
  clearAllQueues
};
```

### Updated Controller: `src/controllers/whatsappController.js`

```javascript
// Add at top of file
const messageQueue = require('../services/messageQueue');

// In receivedMessage function, replace the text case with:

case "text": {
  console.log("📝 TEXT message received");
  const userRequest = messageObject.text.body;
  let number = messageObject.from;

  // Format number if it has 13 digits
  if (number.length === 13) {
    number = formatNumber(number);
  }

  console.log(`User ${number}: "${userRequest}"`);

  // Show typing indicator
  whatsappService.sendTypingIndicator(messageId, "text");

  // Enqueue message for processing (non-blocking)
  messageQueue.enqueueMessage(number, userRequest)
    .catch(err => {
      console.error("❌ Queue processing error:", err);
      // Error already sent to user by queue processor
    });
  
  break;
}
```

## Benefits of This Approach

### 1. **Eliminates Race Conditions**
- Messages are added to queue atomically
- Processing is strictly sequential per user
- No complex lock management needed

### 2. **Better Error Handling**
- Each message has its own promise
- Errors don't block the queue
- Failed messages can be retried

### 3. **Observable System**
```javascript
// Monitor queue health
const depth = messageQueue.getTotalQueueDepth();
const users = messageQueue.getActiveUsers();
console.log(`Queue status: ${depth} messages, ${users} active users`);
```

### 4. **Natural Backpressure**
- Queue grows if processing is slow
- Can add alerts if queue depth exceeds threshold
- Easy to detect performance issues

### 5. **Testable**
```javascript
// Easy to test queue behavior
await messageQueue.enqueueMessage('testUser', 'Hello');
expect(messageQueue.getQueueDepth('testUser')).toBe(1);
```

## Migration Path

If you want to migrate from current lock-based to queue-based:

### Phase 1: Side-by-side (Safe)
1. Add `messageQueue.js` 
2. Test with specific users
3. Monitor both systems

### Phase 2: Gradual Rollout
1. Route 10% of traffic to queue
2. Compare performance/errors
3. Increase to 50%, then 100%

### Phase 3: Cleanup
1. Remove old lock-based code
2. Simplify `openaiService.js`
3. Update documentation

## Monitoring & Metrics

Add monitoring endpoint:

```javascript
// In healthRoutes.js or new monitoring route
router.get('/queue-stats', (req, res) => {
  res.json({
    totalMessages: messageQueue.getTotalQueueDepth(),
    activeUsers: messageQueue.getActiveUsers(),
    timestamp: new Date().toISOString()
  });
});
```

## Performance Comparison

| Metric | Lock-Based | Queue-Based |
|--------|-----------|-------------|
| Race Condition Risk | Low | None |
| Code Complexity | Medium | Low |
| Memory Usage | Low | Slightly Higher |
| Observability | Limited | Excellent |
| Scalability | Single Instance | Redis-Ready |

## Future: Distributed Queue (Redis)

To scale across multiple servers, replace in-memory Map with Redis:

```javascript
// Using Bull queue
const Queue = require('bull');
const messageQueue = new Queue('whatsapp-messages', {
  redis: { host: 'localhost', port: 6379 }
});

messageQueue.process(async (job) => {
  const { userId, message, context } = job.data;
  return await openaiService.getAIResponse(message, userId, context);
});

// Enqueue
await messageQueue.add({ userId, message, context });
```

## Recommendation

**For your current setup**: Stick with the improved lock-based approach (Option 1).

**Consider this queue approach** when:
- You need better observability
- Planning to scale to multiple instances
- Want cleaner, more maintainable code
- Experiencing any race conditions

The queue pattern is more "correct" architecturally, but adds complexity you might not need yet.

---

**Status**: ✅ Reference Implementation (Not Currently Used)  
**Priority**: LOW (current solution is sufficient)  
**Effort**: ~2-3 hours to implement and test
