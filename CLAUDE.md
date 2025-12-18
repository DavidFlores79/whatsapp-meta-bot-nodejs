# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

WhatsApp bot with AI-powered responses and CRM system. Processes WhatsApp Cloud webhook events and integrates with OpenAI Assistant API for intelligent conversations. Includes Angular frontend for agent management.

**Tech Stack**: Node.js (≥22.0.0) + Express + MongoDB + Socket.io + OpenAI Assistant | Angular 21 + Tailwind CSS

## Development Commands

### Backend
```bash
npm run dev          # Development with nodemon (watches src/)
npm start            # Production
npm run test:threads # Test OpenAI thread optimization
npm run create-admin # Create admin agent
npm run reset-admin  # Reset admin password
```

### Frontend
```bash
cd frontend && npm start   # Dev server (ng serve)
cd frontend && npm run build   # Production build (outputs to dist/frontend/browser/)
cd frontend && npm run watch   # Build with watch mode
```

### Full Stack Build
```bash
npm run build         # Builds frontend Angular app (cross-platform)
npm run build:install # Install all dependencies + build (fresh setup)
```

### Deployment
```bash
# Windows
npm run deploy:prepare   # Build + run PowerShell deployment script

# Linux/Mac
npm run deploy:prepare:unix   # Build + run Bash deployment script
# Or manually: ./deploy.sh
```

## High-Level Architecture

### Request Flow
1. **WhatsApp webhook** → `POST /api/v2/` → `whatsappController.js`
2. **Message routing** → `messageHandlers.js` → `queueService.js` (deduplicates, batches)
3. **Queue processing** → checks conversation status → routes to AI or agent
4. **AI path**: `openaiService.js` (manages per-user threads) → WhatsApp API
5. **Agent path**: Stored in DB → Socket.io → Frontend → Agent response → WhatsApp API

### Critical Components

**Server Initialization** (`src/models/server.js`):
- Constructor immediately starts HTTP server and Socket.io (listen() is a no-op)
- Attaches `req.io` to all requests for Socket.io emission
- Serves Angular static files from `frontend/dist/frontend/browser/`
- Starts `autoTimeoutService` background process
- **Route structure**: `/api/v2/*` (WhatsApp, agents, conversations, customers, templates) + `/health` + `/info`

**OpenAI Thread Management** (`src/services/openaiService.js`):
- **Dual persistence**: In-memory Map + MongoDB (UserThread model)
- **Per-user threads**: Phone number = userId = thread key
- **Auto-cleanup**: Keeps last 10 messages per thread, triggers at 15 messages
- **Token optimization**: Reduces OpenAI costs 70%+ by preventing unlimited context
- **Tool calling**: Assistant can execute `create_ticket_report()`, `get_ticket_information()`
- **Race condition protection**: Concurrent requests for same user are queued to prevent thread conflicts
- **Message ordering**: Ensures messages are processed in the order received per user

**Message Queue System** (`src/services/queueService.js`):
- Batches messages per user with configurable wait time (default 3000ms = 3 seconds)
- Deduplicates using message IDs stored in `Set` with TTL (60 seconds)
- Checks conversation assignment before routing to AI or agent
- Prevents message fragmentation during rapid user input (burst detection)

**CRM Integration**:
- **Agent authentication**: JWT-based (`authService.js`, `authMiddleware.js`)
- **Conversation lifecycle**: open → assigned → resolved → closed
- **Agent takeover**: `takeoverSuggestionService.js` monitors keywords, suggests agent assignment
- **Auto-timeout**: `autoTimeoutService.js` auto-resolves inactive conversations (default 24h, configurable per conversation)
- **Assignment**: `agentAssignmentService.js` assigns conversations to online agents (round-robin)
- **Message relay**: `agentMessageRelayService.js` sends agent messages to WhatsApp
- **Background jobs**: Auto-timeout service runs continuously checking for stale conversations

### Data Models

**Core collections**:
- `UserThread`: OpenAI thread persistence (userId=phone, threadId, messageCount, lastCleanup)
- `Customer`: WhatsApp user profiles (phoneNumber unique, firstName, tags, totalConversations)
- `Conversation`: Chat sessions (customerId, assignedAgent, status, priority, isAIEnabled)
- `Message`: Individual messages (conversationId, customerId, agentId, content, messageType)
- `Agent`: CRM agents (email unique, role, status, permissions, assignedConversations)
- `Template`: WhatsApp approved templates (name unique, status, category, language, components, parameters)

**Key relationships**:
- Customer ↔ Conversation (1:many)
- Conversation ↔ Message (1:many)
- Agent ↔ Conversation (many:many via assignedAgent/assignedConversations)
- UserThread references conversationId and customerId
- Template usage tracked in Message.template field

## Project-Specific Conventions

### Phone Number Format (Mexico-Centric)
- **Input**: 13-digit (5219991234567) → **Output**: 12-digit (529991234567)
- Use `formatNumber()` from `src/shared/processMessage.js`
- Phone number serves as `userId` for OpenAI threads and Customer lookup

### Message Builders Return JSON Strings
```javascript
// ✅ Correct
const data = buildTextJSON(phoneNumber, "Hello");
whatsappService.sendWhatsappResponse(data);

// ❌ Wrong - don't parse, builders return strings
const obj = JSON.parse(buildTextJSON(...));
```

### Socket.io Patterns
- `req.io` is attached in server middleware - **never remove**
- Emit from controllers: `req.io.emit('incoming_messages', payload)`
- Frontend listens to: `incoming_messages`, `agent_status_changed`, `conversation_updated`, `new_message`

### Error Handling Pattern
```javascript
try {
  // Operation
} catch (error) {
  console.error("Error:", error);
  const errorPayload = buildTextJSON(phoneNumber, "User-friendly error message");
  whatsappService.sendWhatsappResponse(errorPayload);
}
```

### Route Prefix Preservation
- WhatsApp webhooks depend on `/api/v2` prefix - **never change**
- Agent routes: `/api/v2/agents/*`
- Conversation routes: `/api/v2/conversations/*`
- Angular catch-all: `app.get('*')` returns index.html (handles frontend routing)

### Webhook Response Time Requirements
- WhatsApp Cloud API requires webhook response within **20 seconds** or it will timeout and retry
- Current architecture responds immediately (200 OK) and processes messages asynchronously via queue
- **Critical**: Never block webhook response with slow operations (AI calls, DB writes, etc.)
- Message processing happens in `queueService` after webhook acknowledgment

## Important Rules

1. **NO AI Attribution in Commits**: Never include "Generated with Claude Code", "Co-Authored-By: Claude", emojis (🤖), or any AI tool references in commit messages. All commits must appear human-authored.

2. **Preserve Critical Middleware**:
   - `req.io` attachment (Socket.io)
   - Trust proxy settings (required for rate limiting behind reverse proxy)
   - CORS and security headers

3. **Thread Cleanup Logic**: Don't disable automatic cleanup in `openaiService.js` - critical for cost control

4. **Message Deduplication**: `processedMessages` Set in `messageHandlers.js` prevents webhook duplicate processing (60s TTL)

5. **Server Constructor Behavior**: `src/models/server.js` constructor starts server immediately - `listen()` method intentionally does nothing

## Environment Variables

Required in `.env`:
```env
# Server
PORT=5000
NODE_ENV=production
MONGODB=mongodb://connection_string

# WhatsApp Cloud API
WHATSAPP_URI=graph.facebook.com
WHATSAPP_VERSION=v20.0
WHATSAPP_PHONE_NUMBER_ID=your_phone_id
WHATSAPP_BUSINESS_ACCOUNT_ID=your_waba_id
WHATSAPP_API_TOKEN=your_verify_token
WHATSAPP_ACCESS_TOKEN=your_access_token
WHATSAPP_ADMIN=admin_phone_number

# OpenAI
OPENAI_API_KEY=your_key
OPENAI_ASSISTANT_ID=your_assistant_id

# JWT Authentication
JWT_SECRET=your_jwt_secret_key
JWT_EXPIRES_IN=24h

# Security & Rate Limiting
RATE_LIMIT_MAX=100
RATE_LIMIT_WINDOW_MS=900000
```

**Optional variables** (for extended features):
```env
# Image Upload (Cloudinary)
CLOUDINARY_URL=cloudinary://api_key:api_secret@cloud_name
CLOUDINARY_CLOUD_NAME=your_cloud_name
CLOUDINARY_API_KEY=your_api_key
CLOUDINARY_API_SECRET=your_api_secret

# Geocoding (Google Maps API)
GOOGLE_MAPS_API_KEY=your_google_maps_key
```

**Notes**:
- `WHATSAPP_BUSINESS_ACCOUNT_ID` is required for template management - fetch from Meta Business Manager
- `JWT_SECRET` must be set for agent authentication to work
- Cloudinary variables are needed for image message handling
- Google Maps API key enables location message geocoding

## Testing & Debugging

- **Thread optimization**: `node test-thread-optimization.js`
- **Webhook testing**: Use WhatsApp Business API sandbox or ngrok tunnel
- **Database inspection**: Check `UserThread` collection for cleanup operations
- **Frontend dev**: Run Angular dev server separately (`cd frontend && npm start`) during development
- **Socket.io debug**: Monitor browser console for real-time events
- **Health checks**:
  - `GET /health` - Full health check with MongoDB and dependency status
  - `GET /health/ready` - Readiness probe (for load balancers)
  - `GET /health/live` - Liveness probe (for container orchestration)
  - `GET /info` - Service information and statistics

## Message Type Handlers

Current implementation in `messageHandlers.js`:
- **text**: Queued → processed by AI or agent based on conversation status
- **image**: Uploaded to Cloudinary, stored in Message model
- **location**: Geocoded with Google Maps API
- **interactive**: Button/list selections (partially implemented)

## Key Services

- **openaiService**: Thread management, AI responses, context cleanup
- **queueService**: Message batching, deduplication, routing
- **agentAssignmentService**: Auto-assign conversations to available agents
- **takeoverSuggestionService**: Monitors messages, suggests agent takeover
- **autoTimeoutService**: Background job to resolve stale conversations
- **agentMessageRelayService**: Sends agent messages to WhatsApp
- **templateService**: Sync templates from Meta API, manage template library
- **cloudinaryService**: Image upload and management
- **geocodingService**: Location data processing
- **authService**: JWT authentication, token refresh, session management
- **whatsappService**: HTTP client for WhatsApp Cloud API

## Template Management

### Overview
The system integrates with WhatsApp Business API to manage and send pre-approved message templates for marketing, utility, and authentication purposes.

### Backend Architecture
- **Model**: `Template.js` - Stores synced templates with metadata (name, status, category, language, components, parameters)
- **Service**: `templateService.js` - Fetches templates from Meta API, syncs to local DB, manages template library
- **Controller**: `templateController.js` - Handles template CRUD, sending (single/bulk)
- **Routes**: `POST /api/v2/templates/sync`, `GET /api/v2/templates`, `POST /api/v2/templates/send`, `POST /api/v2/templates/send-bulk`

### Frontend Components
- **TemplateListComponent**: Browse, filter, search templates; sync from Meta
- **TemplateSenderComponent**: Select template, fill parameters, preview, send to customer
- **Integration**: Template sender button in chat window header (requires saved customer)

### Template Workflow
1. **Sync**: Click "Sync from Meta" → Fetches approved templates from WhatsApp Business API → Stores in MongoDB
2. **Browse**: View templates by status (APPROVED/PENDING/REJECTED), category (MARKETING/UTILITY/AUTHENTICATION), language
3. **Send Single**: Chat window → Template button → Select template → Fill parameters → Preview → Send
4. **Send Bulk**: Templates page → Select template → Choose customers (by ID or filters) → Send to multiple recipients
5. **Tracking**: Template usage count and last used timestamp updated automatically

### Important Notes
- Only APPROVED templates can be sent via API
- Templates must be created and approved in Meta Business Manager first
- Template parameters support text, currency, date_time types
- Parameters are validated before sending (all required fields must be filled)
- Bulk sending includes 1-second delay between messages to prevent rate limiting
- Messages saved to DB with `type: 'template'` and full template metadata

## Frontend Integration

- **Framework**: Angular 21 standalone components
- **Styling**: Tailwind CSS
- **Real-time**: Socket.io client connects to backend
- **Auth**: JWT stored in localStorage, attached via HTTP interceptor
- **Build output**: `frontend/dist/frontend/browser/` served by Express as static files
- **Routing**: Angular Router handles client-side routes; Express catch-all serves index.html
- **Pages**: Login, Conversations (chat), Customers, Templates
- **Build compatibility**: Build scripts work cross-platform (Windows/Mac/Linux)

## Documentation Structure

**Root directory files** (user-facing):
- `README.md` - Project overview and quick start
- `CLAUDE.md` - AI assistant guidance (this file)
- `CONTRIBUTING.md` - Contribution guidelines
- `CHANGELOG.md` - Version history
- `DEPLOYMENT_GUIDE.md` - Deployment instructions

**docs/ directory** (technical documentation):
- API documentation, implementation guides, testing guides
- Database schema, thread optimization details
- Migration guides, bug fix summaries
- Development tasks and TODO lists
