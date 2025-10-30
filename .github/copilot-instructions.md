<!-- Copilot instructions for contributors and automated agents -->
# WhatsApp Bot with OpenAI Assistant Integration

This repo implements a WhatsApp bot with AI-powered responses that processes WhatsApp Cloud webhook events and integrates with OpenAI Assistant API for intelligent conversations.

## Architecture Overview

- **App entry**: `src/app.js` → constructs `src/models/server.js` Server class
- **Server setup**: Express + Socket.io + static files + body parsing + CORS headers + security headers
- **Routes**: `src/routes/whatsappRoutes.js` mounted at `/api/v2` (webhook verification, message processing, templates)
- **Core controller**: `src/controllers/whatsappController.js` handles webhook verification, message dispatch, and AI responses
- **AI Service**: `src/services/openaiService.js` manages OpenAI Assistant conversations with per-user thread persistence
- **Message builders**: `src/shared/whatsappModels.js` creates WhatsApp Cloud API JSON payloads
- **Transport**: `src/services/whatsappService.js` sends HTTPS requests to WhatsApp Cloud API

## Critical AI & Context Management System

**Per-user conversation threads** are the core feature:
- Each WhatsApp user gets a dedicated OpenAI Assistant thread (stored in `UserThread` model)
- **Dual persistence**: In-memory cache (`Map`) + MongoDB for reliability across restarts
- **Automatic thread cleanup**: Keeps last 10 messages per thread, triggers cleanup at 15 messages
- **Token optimization**: Prevents unlimited context growth, reduces OpenAI costs by 70%+
- **Tool calling**: Assistant can execute functions like `create_ticket_report()` and `get_ticket_information()`

### Key AI Flow:
```javascript
// Text message → OpenAI Assistant → AI response
const aiReply = await openaiService.getAIResponse(userMessage, phoneNumber);
const payload = buildTextJSON(phoneNumber, aiReply);
whatsappService.sendWhatsappResponse(payload);
```

## Environment Variables (Required)

```env
# Server
PORT=5000
MONGODB=mongodb://connection_string

# WhatsApp Cloud API
WHATSAPP_URI=graph.facebook.com
WHATSAPP_VERSION=v20.0
WHATSAPP_PHONE_NUMBER_ID=your_phone_id
WHATSAPP_API_TOKEN=your_api_token
WHATSAPP_ACCESS_TOKEN=your_access_token
WHATSAPP_ADMIN=admin_phone_number

# OpenAI Assistant
OPENAI_API_KEY=your_openai_key
OPENAI_ASSISTANT_ID=your_assistant_id
```

## Developer Workflows

```bash
npm run dev          # Development with nodemon
npm start            # Production
npm run test:threads # Test thread optimization
```

**Important**: `src/models/server.js` constructor immediately starts the HTTP server and Socket.io. The `listen()` method is intentionally a no-op.

## Project-Specific Conventions

### Phone Number Handling
- **Mexico-centric**: 13-digit numbers (5219991234567) → 12-digit (529991234567)
- Use `formatNumber()` from `src/shared/processMessage.js` for incoming webhooks
- Phone numbers serve as `userId` for OpenAI threads

### Message Builders Return JSON Strings
```javascript
// ✅ Correct - builders return JSON strings
const data = buildTextJSON(number, "Hello");
whatsappService.sendWhatsappResponse(data);

// ❌ Wrong - don't expect objects
const data = buildTextJSON(number, "Hello");
const obj = JSON.parse(data); // unnecessary
```

### Socket.io Integration
- `req.io` is attached in `src/models/server.js` middleware
- Controllers emit real-time events: `req.io.emit("incoming_messages", req.body)`
- **Never remove** `req.io` attachment - it's expected throughout the app

### Error Handling Pattern
```javascript
try {
  // AI or WhatsApp operation
} catch (error) {
  console.error("Error:", error);
  const errorPayload = buildTextJSON(number, "Error message for user");
  whatsappService.sendWhatsappResponse(errorPayload);
}
```

## Message Type Handling

Current message types in `receivedMessage()`:
- **text**: Processed by OpenAI Assistant → AI response
- **interactive**: Button/list selections (TODO: implement)
- **image**: Acknowledged with placeholder (TODO: Cloudinary integration)
- **location**: Acknowledged with placeholder (TODO: geocoding integration)

## API Endpoints

- `GET /api/v2/` - WhatsApp webhook verification
- `POST /api/v2/` - WhatsApp webhook receiver (main entry point)
- `POST /api/v2/send` - Send template messages
- `POST /api/v2/cleanup-thread` - Manual thread cleanup for user

## Key Files for Modifications

### Core Infrastructure
- `src/models/server.js` - Express setup, middleware, Socket.io
- `src/database/config.js` - MongoDB connection
- `src/models/UserThread.js` - Thread persistence schema

### Message Processing
- `src/controllers/whatsappController.js` - Main webhook handler
- `src/services/openaiService.js` - AI conversation management
- `src/shared/whatsappModels.js` - WhatsApp API payload builders

### Utilities
- `src/shared/processMessage.js` - Phone formatting, text analysis
- `src/services/whatsappService.js` - HTTP client for WhatsApp API

## Thread Management Commands

```bash
# Manual thread cleanup
curl -X POST http://localhost:5000/api/v2/cleanup-thread \
  -H "Content-Type: application/json" \
  -d '{"userId": "529991234567"}'

# Check active users
const stats = await openaiService.getActiveUsersCount();
// Returns: { inMemory: 5, database: 5 }
```

## Rules for AI Agents

1. **Preserve `/api/v2` route prefix** - WhatsApp webhooks depend on it
2. **Don't modify message builder return types** - they must return JSON strings
3. **Keep `req.io` middleware** - Socket.io events depend on it
4. **Maintain phone number formatting** - Mexico-specific logic is embedded
5. **Respect thread cleanup logic** - Don't disable automatic cleanup
6. **Test with actual WhatsApp webhooks** - Payload structure is specific

## Testing & Debugging

- **Thread optimization**: `node test-thread-optimization.js`
- **Webhook testing**: Use WhatsApp Business API sandbox
- **AI responses**: Check OpenAI Assistant logs and token usage
- **Database**: Monitor `UserThread` collection for cleanup operations

## Future TODOs (Already Marked in Code)

- **Multimedia support**: Image upload to Cloudinary, location geocoding
- **Interactive messages**: Proper button/list handling
- **Enhanced AI**: Image analysis, location-aware responses
