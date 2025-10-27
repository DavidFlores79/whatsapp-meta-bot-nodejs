# WhatsApp Typing Indicator Implementation

## Overview
This document explains how the typing indicator (three dots "...") is displayed to users while the OpenAI assistant is processing their message.

## How It Works

### 1. **Visual Indicator**
When a user sends a message, they will see the typing indicator (three dots) in their WhatsApp chat while the bot is:
- Processing the message
- Calling OpenAI Assistant API
- Waiting for the AI response
- Executing any tool calls (like ticket creation)

### 2. **Technical Implementation**

#### Files Modified:

##### **src/shared/whatsappModels.js**
- Added `buildStatusJSON()` function to create the typing indicator payload
- Supports two actions:
  - `'typing'` - Shows the three dots indicator
  - `'mark_as_read'` - Marks message as read (optional feature)

```javascript
const buildStatusJSON = (number, action = 'typing') => {
    return JSON.stringify({
        "messaging_product": "whatsapp",
        "to": number,
        "type": action
    });
}
```

##### **src/services/whatsappService.js**
- Added `sendTypingIndicator()` function
- Sends the typing status to WhatsApp Cloud API
- Uses the same HTTPS endpoint as regular messages

```javascript
const sendTypingIndicator = (number, action = 'typing') => {
    const { buildStatusJSON } = require('../shared/whatsappModels');
    const data = buildStatusJSON(number, action);
    // ... sends via HTTPS to WhatsApp API
}
```

##### **src/controllers/whatsappController.js**
- Modified the `'text'` case in `receivedMessage()`
- Calls `sendTypingIndicator()` BEFORE calling OpenAI
- The indicator automatically disappears when the actual message is sent

```javascript
case 'text': {
    // ... number formatting ...
    
    try {
        // 1. Show typing indicator
        whatsappService.sendTypingIndicator(number, 'typing');
        
        // 2. Get AI response (may take 5-30+ seconds)
        const aiReply = await openaiService.getAIResponse(userRequest, number);
        
        // 3. Send reply (typing indicator disappears automatically)
        const replyPayload = buildTextJSON(number, aiReply);
        whatsappService.sendWhatsappResponse(replyPayload);
    } catch (err) {
        console.error('AI response error:', err);
    }
    break;
}
```

## User Experience Flow

```
User → Sends message
  ↓
Bot → Shows "typing..." (three dots)
  ↓
Bot → Processing with OpenAI (5-30 seconds)
  ↓
Bot → Sends response
  ↓
User → Sees bot's message (typing indicator disappears)
```

## Important Notes

### Typing Indicator Duration
- The typing indicator shows for approximately **20 seconds** maximum according to WhatsApp API
- If OpenAI takes longer than 20 seconds, the indicator may disappear before the response arrives
- **Best Practice**: For very long processing times, consider:
  - Sending multiple typing indicators every 15-18 seconds
  - Sending an intermediate message like "Procesando tu solicitud..."

### API Limitations
- The typing indicator is **not guaranteed** to show in all cases
- WhatsApp may rate-limit status updates if sent too frequently
- The indicator automatically clears when you send an actual message

### Error Handling
- If the typing indicator fails to send, the main functionality continues
- Errors are logged but don't block the OpenAI response

## Future Enhancements

### Option 1: Extended Typing for Long Operations
For operations that take >20 seconds:

```javascript
// Keep typing indicator alive for long operations
const keepTypingAlive = async (number, durationMs) => {
    const interval = 18000; // 18 seconds
    const iterations = Math.ceil(durationMs / interval);
    
    for (let i = 0; i < iterations; i++) {
        whatsappService.sendTypingIndicator(number, 'typing');
        await new Promise(resolve => setTimeout(resolve, interval));
    }
};

// Usage:
const typingPromise = keepTypingAlive(number, 60000); // Keep typing for 1 min
const aiReply = await openaiService.getAIResponse(userRequest, number);
// Cancel the typing loop...
```

### Option 2: Progress Messages
For very complex operations:

```javascript
// Send intermediate progress updates
whatsappService.sendTypingIndicator(number, 'typing');
await delay(3000);

const progressMsg = buildTextJSON(number, '🔄 Analizando tu solicitud...');
whatsappService.sendWhatsappResponse(progressMsg);

// Continue processing...
const aiReply = await openaiService.getAIResponse(userRequest, number);
```

### Option 3: Mark Messages as Read
You can also mark incoming messages as read:

```javascript
// In receivedMessage controller
whatsappService.sendTypingIndicator(number, 'mark_as_read');
```

## Testing

To test the typing indicator:

1. Start the server: `npm run dev`
2. Send a message to your WhatsApp bot
3. Immediately look at your WhatsApp - you should see the three dots
4. Wait for the OpenAI response (5-30 seconds typically)
5. The dots disappear when the bot's message arrives

## References

- [WhatsApp Cloud API - Message Status](https://developers.facebook.com/docs/whatsapp/cloud-api/guides/send-messages#status-indicator)
- [WhatsApp Cloud API - Typing Indicator](https://developers.facebook.com/docs/whatsapp/cloud-api/reference/messages#action-object)

## Troubleshooting

**Typing indicator not showing?**
- Verify your WhatsApp API token has the correct permissions
- Check logs for HTTPS errors
- Ensure the phone number format is correct
- Test with WhatsApp API sandbox first

**Indicator disappears too quickly?**
- OpenAI response is < 20 seconds: This is normal behavior
- Response takes >20 seconds: Consider implementing Option 1 or 2 above

**Rate limiting errors?**
- Don't send typing indicators too frequently
- Respect WhatsApp's rate limits (varies by account tier)
