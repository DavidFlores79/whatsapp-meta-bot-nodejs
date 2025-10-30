# OpenAI Thread Optimization

## Overview

This document describes the thread optimization implementation to reduce OpenAI API token usage by limiting the number of messages stored in each user's conversation thread.

## Problem

- OpenAI threads accumulate all messages indefinitely
- Each API call sends the entire conversation history as context
- This leads to increased token usage and higher costs over time
- Longer conversations become increasingly expensive

## Solution

### Automatic Message Cleanup

The system now automatically manages thread size by:

1. **Message Limit**: Keeps only the last 10 messages per thread (configurable via `MAX_MESSAGES_PER_THREAD`)
2. **Cleanup Threshold**: Triggers cleanup when a thread reaches 15 messages (configurable via `CLEANUP_THRESHOLD`)
3. **Smart Cleanup**: Deletes older messages from OpenAI while preserving recent context

### Configuration

```javascript
const MAX_MESSAGES_PER_THREAD = 10;  // Number of messages to keep
const CLEANUP_THRESHOLD = 15;        // When to trigger cleanup
```

### Database Tracking

The `UserThread` model now includes:
- `messageCount`: Tracks total messages sent
- `lastCleanup`: Timestamp of last cleanup operation

### How It Works

1. **Message Counting**: Each new message increments the `messageCount`
2. **Automatic Cleanup**: When `messageCount` reaches `CLEANUP_THRESHOLD`, cleanup is triggered
3. **Message Deletion**: Older messages are deleted from OpenAI thread via API
4. **Counter Reset**: `messageCount` is reset to `MAX_MESSAGES_PER_THREAD`

## Benefits

### Token Savings
- **Before**: Unlimited message history sent with each request
- **After**: Maximum of 10 messages sent as context
- **Savings**: Proportional to conversation length (70%+ for long conversations)

### Cost Reduction
- Reduced input tokens on every AI request
- Lower OpenAI API costs
- More predictable token usage

### Performance
- Faster response times due to less context processing
- More consistent API response times

## Usage

### Automatic Cleanup
No action required - cleanup happens automatically when thresholds are reached.

### Manual Cleanup
Clean up a specific user's thread:

```bash
curl -X POST http://localhost:3000/api/v2/cleanup-thread \
  -H "Content-Type: application/json" \
  -d '{"userId": "1234567890"}'
```

### Monitor Thread Status
Check active users and message counts:

```javascript
const stats = await openaiService.getActiveUsersCount();
console.log(stats); // { inMemory: 5, database: 5 }
```

## Implementation Details

### Message Cleanup Process

1. Fetch all messages from OpenAI thread (ordered by recency)
2. Keep the most recent `MAX_MESSAGES_PER_THREAD` messages
3. Delete older messages via OpenAI API
4. Update database tracking

### Error Handling

- Cleanup failures don't break the conversation flow
- Database errors are logged but don't prevent messaging
- OpenAI API errors during cleanup are logged and ignored

### Memory Management

- In-memory thread cache remains unchanged
- Database persistence ensures reliability across restarts
- Cleanup operations are asynchronous and non-blocking

## Monitoring

### Log Messages
```
🧹 Cleaning up thread thread_abc123 to keep last 10 messages
Found 18 messages in thread
Deleting 8 old messages
✅ Thread cleanup completed. Kept 10 recent messages
```

### Database Queries
```javascript
// Find threads needing cleanup
db.userthreads.find({ messageCount: { $gte: 15 } })

// Check cleanup history
db.userthreads.find({ lastCleanup: { $exists: true } })
```

## Best Practices

1. **Monitor Usage**: Regularly check message counts and cleanup frequency
2. **Adjust Thresholds**: Tune `MAX_MESSAGES_PER_THREAD` and `CLEANUP_THRESHOLD` based on usage patterns
3. **Context Preservation**: Consider keeping important system messages or user preferences
4. **Backup Strategy**: Consider logging important conversations before cleanup if needed

## Future Enhancements

1. **Smart Cleanup**: Preserve important messages (system prompts, user preferences)
2. **Conversation Summarization**: Replace old messages with summaries
3. **User-Specific Limits**: Different limits based on user type or subscription
4. **Batch Cleanup**: Scheduled cleanup for all threads during low-traffic periods

## API Reference

### New Endpoints

#### POST /api/v2/cleanup-thread
Manually clean up a user's thread.

**Request:**
```json
{
  "userId": "1234567890"
}
```

**Response:**
```json
{
  "msg": "Thread cleanup completed for user 1234567890",
  "success": true
}
```

### New Functions

#### cleanupUserThread(userId)
Manually clean up a specific user's thread.

**Parameters:**
- `userId` (string): User's phone number/ID

**Returns:**
- `boolean`: Success status

## Migration

This optimization is backward compatible:
- Existing threads continue to work
- Cleanup only affects future conversations
- No data loss for recent messages
- Database schema updates are additive

## Testing

Test the optimization:

1. **Create Long Conversation**: Send 20+ messages to trigger cleanup
2. **Verify Cleanup**: Check logs for cleanup messages
3. **Test Manual Cleanup**: Use the cleanup endpoint
4. **Monitor Tokens**: Compare token usage before/after

## Troubleshooting

### Common Issues

1. **Cleanup Not Triggering**: Check `CLEANUP_THRESHOLD` setting
2. **Database Errors**: Verify MongoDB connection and permissions
3. **OpenAI API Errors**: Check API key and rate limits
4. **Thread Not Found**: Verify userId format and thread existence

### Debug Commands

```javascript
// Check thread status
const userThread = await UserThread.findOne({ userId: "1234567890" });
console.log(userThread);

// Manual cleanup
await openaiService.cleanupUserThread("1234567890");

// Clear all contexts
await openaiService.clearAllContexts();
```