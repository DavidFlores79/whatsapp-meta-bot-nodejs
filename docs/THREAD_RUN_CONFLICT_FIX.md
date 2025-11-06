# OpenAI Thread Run Conflict - Fix Documentation

## Problem
Error: `Can't add messages to thread_XXX while a run run_XXX is active`

## Root Cause
Race condition between cancelling active runs and adding new messages to a thread. The issue occurred because:

1. **Incomplete cancellation check**: Code only checked for `queued` and `in_progress` states
2. **Missing "cancelling" state**: Runs transitioning to cancelled state were not detected
3. **Insufficient wait time**: 10 seconds wasn't always enough for cancellation to complete
4. **No retry mechanism**: Failed immediately if a run was still active

## Solution Implemented

### 1. Enhanced Active Run Detection
```javascript
// Now checks for ALL non-terminal states
const problematicRuns = runsResponse.data.data.filter(
  (run) => run.status === "queued" || 
           run.status === "in_progress" || 
           run.status === "cancelling"  // ← Added this
);
```

### 2. Extended Wait Time
- Increased from **10 seconds to 15 seconds**
- Added 3-second fallback wait if runs still not terminal
- Total possible wait: up to 18 seconds

### 3. Better Status Monitoring
```javascript
// Enhanced logging to see exactly what's happening
const states = activeRunsCheck.map(r => `${r.id.slice(-8)}:${r.status}`).join(', ');
console.log(`Waiting for runs to complete: ${states} (${attempts}/${maxAttempts})`);
```

### 4. Message Addition Retry Logic
```javascript
// Retry up to 3 times if run conflict detected
while (!messageAdded && retryCount < maxRetries) {
  try {
    await axios.post(...); // Add message
    messageAdded = true;
  } catch (msgError) {
    if (msgError.response?.data?.error?.message?.includes("while a run")) {
      // Wait and retry
      await new Promise(resolve => setTimeout(resolve, 2000));
      await ensureNoActiveRun(threadId, headers);
    }
  }
}
```

## Changes Made

### File: `src/services/openaiService.js`

#### Function: `ensureNoActiveRun()`
- ✅ Added "cancelling" status to detection
- ✅ Increased max wait from 10s to 15s
- ✅ Enhanced logging with run IDs and statuses
- ✅ Extended fallback wait to 3 seconds

#### Function: `getAIResponse()`
- ✅ Added retry loop for message addition (max 3 attempts)
- ✅ Detects run conflict errors specifically
- ✅ Re-checks for active runs between retries
- ✅ Throws clear error if retries exhausted

## OpenAI Run States Reference

| State | Description | Can Add Messages? |
|-------|-------------|-------------------|
| `queued` | Waiting to start | ❌ No |
| `in_progress` | Currently running | ❌ No |
| `cancelling` | Being cancelled | ❌ No |
| `cancelled` | Successfully cancelled | ✅ Yes |
| `completed` | Finished successfully | ✅ Yes |
| `failed` | Failed with error | ✅ Yes |
| `expired` | Timed out | ✅ Yes |

**Key Insight**: The `cancelling` state was the missing piece - runs in this state block message additions but weren't being detected!

## Testing Recommendations

### 1. Rapid Message Test
Send multiple messages quickly (within 2-3 seconds):
```bash
# User sends: "Hello"
# User sends: "How are you?" (immediately)
# User sends: "What time is it?" (immediately)
```

**Expected**: All messages should be processed without run conflicts.

### 2. Long-Running Assistant Test
If your assistant has slow tool calls or long processing:
```bash
# User sends: "Create a ticket with full details"
# (While assistant is processing...)
# User sends: "Cancel that"
```

**Expected**: Second message should wait for first run to complete/cancel.

### 3. Monitor Logs
Look for these success indicators:
```
✅ All runs reached terminal state
✅ Message added to thread successfully
```

Look for these warnings (should recover automatically):
```
⚠️ Run still active, retry 1/3 in 2s...
⚠️ Some runs still not in terminal state after waiting
```

## Performance Impact

- **Average case**: No change (no active runs)
- **Conflict case**: Additional 2-4 seconds wait + retries
- **Worst case**: Up to 18 seconds wait + 6 seconds retry time = 24 seconds max

This is acceptable for a WhatsApp bot where user tolerance is ~30 seconds.

## Error Handling Flow

```
User sends message
    ↓
Get/Create thread
    ↓
Check for active runs
    ↓
Found active? → Cancel them → Wait up to 15s → Check again
    ↓
No active runs
    ↓
Try to add message
    ↓
Run conflict? → Wait 2s → Retry (max 3 times)
    ↓
Message added successfully ✅
    ↓
Create new run
    ↓
Poll until completion
```

## Additional Recommendations

### 1. Monitor Thread Cleanup
The existing cleanup logic already helps prevent too many messages:
- Triggers at 15 messages
- Keeps last 10 messages
- This reduces run processing time

### 2. Consider Rate Limiting
If users spam messages very quickly, consider:
```javascript
// In whatsappController.js
const userLastMessage = new Map();
const MIN_MESSAGE_INTERVAL = 2000; // 2 seconds

// Before processing message
const lastTime = userLastMessage.get(phoneNumber) || 0;
const now = Date.now();
if (now - lastTime < MIN_MESSAGE_INTERVAL) {
  console.log(`Rate limit: ignoring rapid message from ${phoneNumber}`);
  return;
}
userLastMessage.set(phoneNumber, now);
```

### 3. Implement Message Queue
For high-traffic scenarios, consider a message queue:
```javascript
// Per-user message queue to process sequentially
const userQueues = new Map();

async function queueMessage(userId, message, context) {
  if (!userQueues.has(userId)) {
    userQueues.set(userId, []);
  }
  
  const queue = userQueues.get(userId);
  queue.push({ message, context });
  
  if (queue.length === 1) {
    await processQueue(userId);
  }
}

async function processQueue(userId) {
  const queue = userQueues.get(userId);
  while (queue.length > 0) {
    const { message, context } = queue[0];
    await getAIResponse(message, userId, context);
    queue.shift();
  }
  userQueues.delete(userId);
}
```

## Rollback Plan

If issues persist, revert to previous version and implement message queue instead:
```bash
git log --oneline -- src/services/openaiService.js
git checkout <commit-hash> -- src/services/openaiService.js
```

## Success Criteria

✅ No more "Can't add messages while run is active" errors
✅ Messages processed even during rapid user input
✅ Graceful handling of concurrent requests
✅ Clear logging for debugging
✅ Automatic retry on transient failures

## Related Documentation
- [THREAD_OPTIMIZATION.md](./THREAD_OPTIMIZATION.md) - Thread cleanup strategy
- [API_DOCUMENTATION.md](./API_DOCUMENTATION.md) - API endpoints
- [.github/copilot-instructions.md](../.github/copilot-instructions.md) - Project conventions

---
**Last Updated**: 2025-11-06
**Status**: ✅ Implemented and Ready for Testing
