# WhatsApp Meta Bot - AI Agent Instructions

WhatsApp bot with AI-powered responses and CRM system. Node.js + Express + MongoDB + Socket.io + OpenAI Assistant | Angular 21 + Tailwind CSS frontend.

## Request Flow Architecture

1. **WhatsApp webhook** → `POST /api/v2/` → `whatsappController.js` (responds immediately with 200)
2. **Deduplication** → `deduplicationService.js` checks message ID (60s TTL Set)
3. **Queue** → `queueService.js` batches rapid messages (2s wait time)
4. **Routing** → checks conversation status → AI path or Agent path
5. **AI**: `openaiService.js` (per-user thread management) → WhatsApp API
6. **Agent**: DB → Socket.io → Frontend → Agent response → WhatsApp API

## Development Commands

```bash
# Backend
npm run dev              # Development (nodemon watches src/)
npm run create-admin     # Create admin agent
npm run reset-admin      # Reset admin password

# Frontend (cd frontend/)
npm start                # Dev server on localhost:4200
npm run build            # Production build → dist/frontend/browser/

# Full stack
npm run build:install    # Fresh setup: install all deps + build frontend
```

## Critical Backend Patterns

### Server Constructor Starts Immediately
`src/models/server.js` constructor starts HTTP server and Socket.io. The `listen()` method is a no-op - never call it expecting startup.

### Webhook Response Time
WhatsApp requires response within 20 seconds. Current architecture:
```javascript
// In whatsappController.js - respond FIRST, process AFTER
res.send("EVENT_RECEIVED");  // Immediate response
// Then async processing via queueService
```

### OpenAI Thread Management (`src/services/openaiService.js`)
- **Dual persistence**: In-memory Map + MongoDB (`UserThread` model)
- **Auto-cleanup**: Keeps 10 messages, triggers cleanup at 15
- **Race protection**: `processingUsers` Map queues concurrent requests per user
- Never disable cleanup logic - critical for 70%+ cost reduction

### Message Builders Return JSON Strings
```javascript
// ✅ Correct
const data = buildTextJSON(phoneNumber, "Hello");
whatsappService.sendWhatsappResponse(data);

// ❌ Wrong - builders already return strings
JSON.parse(buildTextJSON(...));
```

### Phone Number Format (Mexico)
13-digit (5219991234567) → 12-digit (529991234567) via `formatNumber()` in `src/shared/processMessage.js`. Phone = userId for threads.

### Socket.io via req.io
Attached in `src/models/server.js` middleware. All controllers access `req.io.emit()`. Never remove this middleware.

## Service Boundaries

### Conversation Lifecycle (`conversationLifecycleService.js`)
- **States**: `open` → `assigned` → `waiting` → `resolved` → `closed`
- `resolveConversation()` - Agent marks done, sends WhatsApp confirmation buttons
- `closeConversation()` - Final state, only from resolved or by admin with `force=true`
- `reopenConversation()` - Customer replies to resolved conversation
- Emits `conversation_updated` Socket.io event on state changes

### Agent Assignment (`agentAssignmentService.js`)
- `autoAssignConversation()` - Load-balanced to agent with fewest active chats
- Only assigns to agents with `autoAssign: true` and `status: online|away`
- Max 20 concurrent chats per agent (configurable via `maxConcurrentChats`)
- `assignConversationToAgent()` - Manual assignment, requires agent has `autoAssign` enabled
- Records assignment history in `AgentAssignmentHistory` collection

### Auto-Timeout (`autoTimeoutService.js`)
- Background service runs continuously checking for stale conversations
- Default 24h timeout, configurable per conversation via `timeoutOverride`
- Auto-resolves inactive conversations, emits socket events

## Angular Frontend Architecture

### Structure (`frontend/src/app/`)
```
components/
  auth/login/          # JWT login form
  layout/main-layout/  # Sidebar + header wrapper
  chat/                # Real-time conversation UI
  customers/           # Customer CRUD (list, detail, form)
  agents/              # Agent management (admin only)
  templates/           # WhatsApp template management
  settings/            # CRM settings
services/
  auth.ts              # JWT + localStorage, currentAgent$ observable
  chat.ts              # Socket.io + conversations, chats$ observable
  customer.ts          # Customer API calls
  template.ts          # Template API calls
```

### Auth Pattern (`services/auth.ts`)
- Stores `accessToken`, `refreshToken`, `agent` in localStorage
- `currentAgent$` BehaviorSubject drives UI state across components
- Guards: `authGuard` (any authenticated), `adminGuard` (admin/supervisor only)
- Auto-loads agent from storage on service init

### Real-time Chat (`services/chat.ts`)
- Connects to Socket.io on same origin (production: port 5000)
- `chats$` observable holds all conversations for current agent
- Socket events: `incoming_messages`, `conversation_updated`, `new_message`, `agent_status_changed`
- `loadMessages(chatId)` fetches history, maps `sender: 'agent'|'ai'` → `'me'`, `'customer'` → `'other'`

### API Calls
- All services use relative URLs (`/api/v2/*`) - works in dev proxy and production same-port
- `auth.interceptor.ts` adds `Authorization: Bearer <token>` header
- On 401, clears auth and redirects to `/login`

## Route Prefix Rules

- `/api/v2/*` - All API routes (agents, conversations, customers, templates, webhooks)
- `/health/*` - Health check endpoints
- `/*` (catch-all) - Serves Angular SPA from `frontend/dist/frontend/browser/`

Register specific routes BEFORE `/api/v2` in `server.js` or they won't match.

## Key Files by Feature

| Feature | Files |
|---------|-------|
| Webhook processing | `controllers/whatsappController.js`, `handlers/messageHandlers.js` |
| AI conversations | `services/openaiService.js`, `models/UserThread.js` |
| Message queue/dedup | `services/queueService.js`, `services/deduplicationService.js` |
| CRM agents | `services/authService.js`, `middleware/authMiddleware.js`, `models/Agent.js` |
| Conversation lifecycle | `services/conversationLifecycleService.js`, `services/autoTimeoutService.js` |
| Agent assignment | `services/agentAssignmentService.js`, `models/AgentAssignmentHistory.js` |
| WhatsApp API | `services/whatsappService.js`, `shared/whatsappModels.js` |
| Frontend chat | `frontend/src/app/services/chat.ts`, `components/chat/` |
| Frontend auth | `frontend/src/app/services/auth.ts`, `components/auth/login/` |

## Data Models

- `Customer`: WhatsApp users (phoneNumber unique, tags, totalConversations)
- `Conversation`: Chat sessions (customerId, assignedAgent, status, isAIEnabled)
- `Message`: Individual messages (conversationId, content, direction, attachments)
- `Agent`: CRM agents (email unique, role, permissions, assignedConversations, autoAssign)
- `UserThread`: OpenAI thread persistence (userId=phone, threadId, messageCount)
- `Template`: WhatsApp approved templates (name unique, components, parameters)
- `AgentAssignmentHistory`: Tracks assignment changes (conversationId, fromAgent, toAgent)

## Environment Variables

Required: `PORT`, `MONGODB`, `WHATSAPP_PHONE_NUMBER_ID`, `WHATSAPP_ACCESS_TOKEN`, `OPENAI_API_KEY`, `OPENAI_ASSISTANT_ID`, `JWT_SECRET`

See `CLAUDE.md` for full list with descriptions.

## Rules for AI Agents

1. **Preserve `/api/v2` prefix** - WhatsApp webhooks depend on exact path
2. **Keep `req.io` middleware** - Socket.io events throughout app
3. **Don't modify message builder return types** - must return JSON strings
4. **Never block webhook response** - respond immediately, process async
5. **Respect thread cleanup in openaiService.js** - cost control mechanism
6. **No AI attribution in commits** - no "Generated by Claude", "Co-Authored-By", 🤖 emojis, or AI tool references
