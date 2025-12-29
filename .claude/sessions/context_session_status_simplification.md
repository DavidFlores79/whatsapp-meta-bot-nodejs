# Session: Conversation & Ticket Status Simplification

## Feature Overview
Simplify the dual status system (Conversation + Ticket) following industry best practices from Intercom/HubSpot model.

## Session Info
- **Created**: 2025-12-29
- **Feature Branch**: `feat/status-simplification`
- **Target Branch**: `develop`
- **Status**: Plan Finalized - Ready for Implementation

---

## Problem Statement
Currently the system has two separate status systems that can be confusing:
- **Conversation Status**: `open | assigned | waiting | resolved | closed`
- **Ticket Status**: `new | open | in_progress | pending_customer | waiting_internal | resolved | closed`

Users need to mentally track both systems, leading to confusion about the actual state of customer interactions.

## Goals
1. Simplify conversation statuses to 3 clear states
2. Keep detailed ticket statuses for workflow tracking
3. Add event-based synchronization between entities
4. Create unified status view in UI

---

## Exploration Notes

### Current Architecture Analysis

#### Backend Models

**Conversation Model** (`src/models/Conversation.js`):
- Status: `['open', 'assigned', 'waiting', 'resolved', 'closed']`
- Has `assignedAgent`, `isAIEnabled`, `priority`, `category`
- Tracks resolution via `resolvedAt`, `resolvedBy`, `resolutionNotes`
- Has SLA tracking (`firstResponseTarget`, `resolutionTarget`)
- Includes `priorityHistory` for escalation tracking

**Ticket Model** (`src/models/Ticket.js`):
- Status: `['new', 'open', 'in_progress', 'pending_customer', 'waiting_internal', 'resolved', 'closed']`
- Linked to `customerId`, `conversationId`, `assignedAgent`
- Has `statusHistory` for tracking all status changes
- Resolution info: `resolution.summary`, `resolution.resolvedBy`, `resolution.resolvedAt`
- SLA fields: `slaLevel`, `estimatedResolution`, `firstResponseTime`, `resolutionTime`

#### Backend Services

**conversationLifecycleService.js**:
- `resolveConversation()`: Changes status to 'resolved', sends WhatsApp confirmation
- `closeConversation()`: Final state, requires 'resolved' first (unless forced)
- `reopenConversation()`: Admin/supervisor only
- `handleResolutionConfirmation()`: Customer confirms or denies resolution

**ticketService.js**:
- Full CRUD operations for tickets
- `updateTicketStatus()`: Updates status with history tracking
- `resolveTicket()`: Sets resolution info, sends WhatsApp notification
- No automatic synchronization with conversation status

**autoTimeoutService.js**:
- Checks every 2 minutes for inactive conversations (15 min threshold)
- Releases agent and resumes AI for `assigned` status conversations
- Updates status back to `open`

#### Frontend Components

**Chat System** (`frontend/src/app/components/chat/`):
- `ChatListComponent`: Tabs for Queue/My Chats/All, status filter dropdown
- `ChatService`: Handles real-time Socket.io updates, manages `status` field
- Frontend uses status locally but inconsistently (e.g., 'active' vs backend statuses)

**Ticket System** (`frontend/src/app/components/tickets/`):
- `TicketListComponent`: Full filter UI for all 7 ticket statuses
- `TicketDetailComponent`: Shows ticket with status badge
- `TicketStatusBadgeComponent`: Visual status indicator

### Key Findings

1. **No synchronization exists** between conversation and ticket statuses
2. **Conversation statuses are chat-focused** (who's handling it)
3. **Ticket statuses are workflow-focused** (what stage is the issue)
4. **Frontend has local status values** ('active') not matching backend
5. **Both entities have resolution tracking** but they're independent
6. **SLA tracking exists in both** but not unified

---

## Team Selection & Expert Advice

### Selected Subagents

1. **nodejs-backend-architect** - Completed
2. **angular-frontend-developer** - Completed

### Backend Architect Recommendations

#### Migration Strategy
- **MongoDB Migration Script + Application-Layer Validation**
- Run migration BEFORE deploying code changes
- Status mapping:
  - `open` → `open` (unchanged)
  - `assigned` → `active`
  - `waiting` → `active`
  - `resolved` → `closed`
  - `closed` → `closed` (unchanged)
- Includes rollback capability and audit trail

#### Sync Service Design
- **Mongoose Middleware (Event-Driven)**
- Use `pre('save')` and `post('save')` hooks
- Prevent infinite loops using `findByIdAndUpdate()` for syncs
- Lock mechanism to prevent concurrent operations

#### Ticket-Conversation Relationship Rules
- If ANY ticket is `in_progress` or `open` → Conversation = `active`
- If ALL tickets are `closed` → Conversation = `closed`
- Closing conversation → Force close ALL linked tickets
- Closing individual ticket → Conversation stays active (unless all closed)

#### Race Condition Prevention
- Lock mechanism tracking ongoing syncs
- `isModified('status')` check before sync
- `setImmediate()` for async execution
- Frontend debouncing (500ms)

#### API Changes
- **No new endpoints needed**
- Existing endpoints work with simplified model
- Optional: `GET /api/v2/conversations/:id/sync-status` for debugging

### Frontend Developer Recommendations

#### UnifiedStatusBadgeComponent Design
- **Primary-Secondary Badge Pattern**
- Conversation status (large) + ticket indicator (small dot)
- Three layouts: Compact (mobile), Inline (desktop), Stacked (detail)
- Color scheme:
  - Open (AI active): Blue (`#3B82F6`)
  - Active (Agent handling): Green (`#22C55E`)
  - Closed: Gray (`#6B7280`)
  - Ticket indicator: Colored dot with pulse animation

#### State Management
- **Eager Loading with Selective Population**
- Load linked ticket data with conversations (ticketId, status, priority, category)
- BehaviorSubject-based with batched updates (300ms debounce)

#### ChatListComponent Changes
- **Remove Status Dropdown**
- Replace with icon-based quick filters: "With Ticket", "Urgent"
- Tabs provide sufficient filtering with 3 statuses

#### Socket.io Event
- New event: `unified_status_update`
- Contains both conversation and ticket status
- Batched updates in 300ms windows

---

## Final Implementation Plan

### Phase 1: Backend - Migration & Schema (Day 1-2)

#### 1.1 Create Migration Script
```javascript
// scripts/migrate-conversation-status.js
const statusMapping = {
  'open': 'open',
  'assigned': 'active',
  'waiting': 'active',
  'resolved': 'closed',
  'closed': 'closed'
};
```

#### 1.2 Update Conversation Model
```javascript
status: {
  type: String,
  enum: ['open', 'active', 'closed'],
  default: 'open',
  index: true
}
```

#### 1.3 Update Existing Services
- `agentAssignmentService.js`: `'assigned'` → `'active'`
- `autoTimeoutService.js`: `'assigned'` → `'active'`
- `conversationLifecycleService.js`: Remove `'resolved'`, adapt to 3 statuses
- `queueService.js`: Update status queries

### Phase 2: Backend - Sync Service (Day 3-4)

#### 2.1 Create statusSyncService.js
```javascript
// src/services/statusSyncService.js
class StatusSyncService {
  syncTicketToConversation(ticket, oldStatus, newStatus)
  syncConversationToTickets(conversation, oldStatus, newStatus)
  handleCustomerMessage(conversation)
}
```

#### 2.2 Add Mongoose Middleware
- Conversation `post('save')` hook
- Ticket `post('save')` hook

#### 2.3 Socket.io Events
- `unified_status_update` event
- Include both statuses in payload

### Phase 3: Frontend - Components (Day 5-7)

#### 3.1 Create UnifiedStatusBadgeComponent
- Input: `conversationStatus`, `ticketStatus`, `layout`
- Output: Visual badge with tooltip

#### 3.2 Update ChatService
- Add `linkedTicket` field to Chat interface
- Handle `unified_status_update` event
- Batch updates with RxJS

#### 3.3 Update ChatListComponent
- Update status filter to 3 options
- Add ticket indicator
- Update tabs logic

### Phase 4: Testing & Documentation (Day 8-10)

#### 4.1 Testing
- Unit tests for statusSyncService
- Integration tests for sync scenarios
- E2E tests with Cypress

#### 4.2 Documentation
- Update CLAUDE.md
- API documentation
- Migration guide

---

## Acceptance Criteria

1. **Conversation statuses reduced to 3**: open, active, closed
2. **Ticket statuses remain unchanged**: 7 statuses for workflow tracking
3. **Automatic synchronization**: Status changes propagate correctly
4. **Unified UI display**: Single badge shows combined state
5. **Backward compatible**: Existing conversations migrate properly
6. **Real-time updates**: Socket.io events propagate status changes
7. **No data loss**: All historical conversations preserved

---

## Branch Strategy

- **Branch Name**: `feat/status-simplification`
- **Base Branch**: `develop` (create from `main` if doesn't exist)
- **Target Branch**: `develop`
- **Review Requirements**: 1 reviewer required

### Deployment Order
1. Run migration script on staging
2. Deploy backend changes
3. Deploy frontend changes
4. Run migration script on production
5. Monitor for 7 days

---

## Clarifications & Decisions

### User Decisions (2025-12-29)

| Question | Decision | Rationale |
|----------|----------|-----------|
| **Reopen Rule** | Auto-reopen conversation | Best for continuity, customer doesn't lose context |
| **Ticket Sync** | Force close all tickets | Parent-child hierarchy, clean state |
| **Migration** | Migrate all data | Complete consistency across all conversations |
| **UI Display** | Colored dot indicator | Non-intrusive but informative |

### Final Sync Rules Based on Decisions

1. **Customer messages closed conversation** → Auto-reopen to `open` status
2. **Closing conversation** → Force close ALL linked tickets (set to `closed`)
3. **Ticket status change** → Does NOT affect conversation status (one-way sync)
4. **UI** → Show colored dot for tickets (priority-based color)

---

## Iteration History

### Iteration 1 (2025-12-29)
- Initial exploration completed
- Current architecture documented
- Team selected: nodejs-backend-architect, angular-frontend-developer
- Initial plan drafted

### Iteration 2 (2025-12-29)
- Expert advice received from both subagents
- Plan refined with concrete recommendations
- Migration strategy finalized
- Sync rules defined
- UI patterns selected

### Iteration 3 (2025-12-29) - FINAL
- User clarifications received:
  - Auto-reopen closed conversations on customer message
  - Force close all tickets when conversation closes
  - Migrate all historical data
  - Show colored dot indicator for tickets in UI
- Plan finalized and ready for implementation
- All decision points resolved
