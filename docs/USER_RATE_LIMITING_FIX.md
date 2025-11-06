# Message Queue System - Burst Detection & Smart Combining

## Problem Statement

When users send multiple messages rapidly (e.g., "hello", "my light is broken", "can you help?"), the bot should **combine them into ONE context** and send **ONE comprehensive AI response** instead of processing each message independently.

### Example Scenario:
1. User sends "hello"
2. User sends "my light is broken" (2 seconds later)
3. User sends "can you help?" (1 second later)

**Bad Approach** ❌: Three separate AI calls → Three responses  
**Good Approach** ✅: One combined AI call → One comprehensive response

## Root Cause

Previously, each message was processed independently without detecting message bursts from the same user. This led to:
- Multiple AI responses for related messages
- Higher OpenAI API costs
- Fragmented conversation context
- Poor user experience

## Solution: Message Queue with Burst Detection

### Implementation Overview

Added a **message queue system** that:
1. **Collects messages** from the same user in a time window
2. **Waits for burst to complete** (2-second timeout)
3. **Combines all messages** into one context
4. **Sends ONE AI response** for the entire burst

### Key Components

#### 1. User Message Queue Map
```javascript
const userMessageQueues = new Map();
// userId -> { 
//   messages: [{ text, id, type, timestamp }],
//   timer: timeoutId,
//   processing: false 
// }
```

#### 2. Queue Configuration
```javascript
const QUEUE_WAIT_TIME = 2000; // 2 seconds - wait for burst to complete
```

#### 3. Core Functions
- `queueUserMessage(userId, text, messageId, type, object)` - Add message to queue
- `processUserQueue(userId)` - Combine & process all queued messages

### Processing Flow

```
Message 1 arrives: "hello"
   ↓
✅ Deduplication check passed
   ↓
📥 Add to queue for user X
   ↓
⏱️  Start 2-second timer
   ↓
Message 2 arrives: "my light broke" (1 second later)
   ↓
✅ Deduplication check passed
   ↓
📥 Add to same queue
   ↓
⏱️  RESET timer (2 seconds from now)
   ↓
Message 3 arrives: "help me" (0.5 seconds later)
   ↓
✅ Deduplication check passed
   ↓
📥 Add to same queue
   ↓
⏱️  RESET timer (2 seconds from now)
   ↓
... 2 seconds pass with no new messages ...
   ↓
🚀 PROCESS QUEUE:
   - Combine: "hello\n\nmy light broke\n\nhelp me"
   - Send to OpenAI Assistant
   - Get ONE comprehensive response
   - Send back to user
   ↓
🗑️  Clean up queue for user X
```

### Code Changes

#### Before:
```javascript
// Each message processed independently
case "text": {
  const aiReply = await openaiService.getAIResponse(userRequest, number);
  whatsappService.sendWhatsappResponse(payload);
  // Result: 3 separate AI calls for 3 messages
}
```

#### After:
```javascript
// Messages queued and combined
case "text": {
  queueUserMessage(number, userRequest, messageId, messageType, messageObject);
  // Timer starts/resets
  // After 2s of silence → processUserQueue()
  //   - Combines all queued messages
  //   - ONE AI call with full context
  //   - ONE comprehensive response
}
```

## Benefits

### ✅ User Experience
- **No duplicate responses** when user sends multiple messages
- Bot appears more intelligent and controlled
- Reduces user confusion

### ✅ Cost Optimization
- **Saves OpenAI API costs** by not processing duplicate requests
- **Reduces WhatsApp API calls** by not sending duplicate responses

### ✅ Server Performance
- Prevents **concurrent processing** for same user
- Reduces **database load** (fewer thread operations)
- Prevents **race conditions** in thread management

## Enhanced Logging

The queue system includes detailed console logging:

```
🔔 [2025-11-06T...] NEW WEBHOOK RECEIVED
   Message ID: wamid.XXX
   From: 529991234567
   Text: "hello"
   Active queues: 0

� QUEUED - Message added to queue for 529991234567 (queue size: 1)
⏱️  Timer set - Will process queue in 2000ms if no new messages arrive
📤 Webhook response sent to WhatsApp

--- User sends second message 1 second later ---

🔔 [2025-11-06T...] NEW WEBHOOK RECEIVED
   Message ID: wamid.YYY
   From: 529991234567
   Text: "my light is broken"
   Active queues: 1

📥 QUEUED - Message added to queue for 529991234567 (queue size: 2)
⏱️  Timer set - Will process queue in 2000ms if no new messages arrive
📤 Webhook response sent to WhatsApp

--- 2 seconds pass with no new messages ---

🚀 PROCESSING QUEUE for 529991234567 - 2 message(s)
📝 Combined message (27 chars):
   "hello

my light is broken"
🤖 Calling OpenAI Assistant with combined context...
🤖 OpenAI response received in 4.52s (length: 245 chars)
✅ Single AI response sent to 529991234567 for 2 message(s)
🔓 Queue processing finished for 529991234567
```

## Testing Scenarios

### ✅ Test 1: Message Burst (Main Feature)
**Steps:**
1. Send "hello" to bot
2. **Immediately** send "my light is broken" (within 2 seconds)
3. **Immediately** send "can you help?" (within 2 seconds)
4. Wait for response

**Expected Result:**
- ✅ Only **ONE** comprehensive AI response received
- ✅ Response addresses all three messages contextually
- ✅ Console shows queue building up, then processing all together

### ✅ Test 2: Slow Messages (Normal Conversation)
**Steps:**
1. Send "hello" to bot
2. **Wait 5 seconds** (longer than QUEUE_WAIT_TIME)
3. Send "how are you?"

**Expected Result:**
- ✅ **TWO** separate responses (queue processed after first timeout)
- ✅ Each message processed independently

### ✅ Test 3: Error Recovery
**Steps:**
1. Send message that triggers OpenAI error
2. Send another message immediately

**Expected Result:**
- ✅ Error message sent to user
- ✅ Queue cleaned up properly
- ✅ Second message creates new queue and processes normally

## Edge Cases Handled

### 🛡️ Error Recovery
User lock is **always released** in try/catch blocks:
```javascript
try {
  // Process message
  finishProcessingUser(number);
} catch (err) {
  finishProcessingUser(number); // ✅ Unlock on error
}
```

### 🛡️ All Message Types
Lock/unlock pattern applied to:
- ✅ Text messages
- ✅ Image messages (with Cloudinary upload)
- ✅ Location messages (with geocoding)

### 🛡️ Memory Management
`processingUsers` Map is automatically cleaned when processing finishes (no memory leak).

## Monitoring

### Key Metrics to Track
1. **Processing users count**: `processingUsers.size`
2. **"USER BUSY" occurrences**: Count of ignored messages
3. **Average processing time**: Time between lock/unlock
4. **OpenAI API calls reduction**: Compare before/after metrics

### Dashboard Query (Future)
```javascript
GET /api/v2/stats
{
  "processedMessages": 150,
  "ignoredDuplicates": 45,
  "activeProcessingUsers": 3,
  "avgProcessingTime": "5.2s",
  "costSavings": "$0.15"
}
```

## Related Documentation
- [DUPLICATE_MESSAGE_PREVENTION.md](./DUPLICATE_MESSAGE_PREVENTION.md) - WhatsApp webhook deduplication
- [THREAD_RUN_CONFLICT_FIX.md](./THREAD_RUN_CONFLICT_FIX.md) - OpenAI thread concurrency
- [CODE_REVIEW_DUPLICATE_PREVENTION.md](./CODE_REVIEW_DUPLICATE_PREVENTION.md) - Full code review

## Deployment Checklist

- [x] Code implemented with lock/unlock pattern
- [x] Error handling with unlock on failure
- [x] Applied to all message types (text, image, location)
- [x] Enhanced logging for debugging
- [x] No memory leaks (Map cleanup)
- [ ] Test with production WhatsApp (rapid messages)
- [ ] Monitor OpenAI cost reduction
- [ ] Track "USER BUSY" occurrences in logs

---

**Fix Date**: November 6, 2025  
**Impact**: Critical - Prevents duplicate AI responses when users spam messages  
**Status**: ✅ Deployed and Ready for Testing
