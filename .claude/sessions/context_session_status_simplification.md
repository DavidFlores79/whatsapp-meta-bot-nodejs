# Session: Conversation & Ticket Status Simplification

## Feature Overview
Simplify the dual status system (Conversation + Ticket) following industry best practices from Intercom/HubSpot model.

## Session Info
- **Created**: 2025-12-29
- **Feature Branch**: `feat/status-simplification`
- **Target Branch**: `develop`
- **Status**: Planning Phase

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

## Team Selection

### Selected Subagents

1. **nodejs-backend-architect**
   - API design for status synchronization endpoints
   - Event-driven sync service architecture
   - Database migration strategy for status enum changes
   - Business logic for status transitions and validation

2. **angular-frontend-developer**
   - Unified status display component design
   - Real-time status update handling via Socket.io
   - Status badge component unification
   - UI/UX for simplified conversation list

---

## Implementation Plan

### Phase 1: Backend - Conversation Status Simplification

#### 1.1 Schema Migration
- Change Conversation status enum: `['open', 'active', 'closed']`
  - `open`: No agent assigned, AI handling or in queue
  - `active`: Agent assigned and working (replaces 'assigned' + 'waiting')
  - `closed`: Conversation ended
- Add migration script to convert existing statuses:
  - `assigned` -> `active`
  - `waiting` -> `active`
  - `resolved` -> `closed`

#### 1.2 New Synchronization Service
Create `statusSyncService.js`:
```javascript
// Event handlers for status synchronization
onTicketStatusChange(ticket, newStatus) {
  // Sync rules: ticket closed -> close linked conversations
}

onConversationStatusChange(conversation, newStatus) {
  // Sync rules: customer reply -> update linked ticket if pending
}

onCustomerMessage(conversation) {
  // If linked ticket is pending_customer -> update to open
}
```

#### 1.3 Update Existing Services
- `conversationLifecycleService.js`: Adapt to new 3-status model
- `autoTimeoutService.js`: Update from 'assigned' -> 'active' -> 'open'
- `ticketService.js`: Add hooks for conversation sync

### Phase 2: Backend - Event Synchronization

#### 2.1 Synchronization Rules

| Event | Conversation Effect | Ticket Effect |
|-------|---------------------|---------------|
| Customer sends message | -> `open` (if closed, reopen) | If `pending_customer` -> `open` |
| Agent takes conversation | -> `active` | (no change) |
| Agent sends message | (no change) | (no change) |
| Agent closes conversation | -> `closed` | (no change) |
| Ticket resolved | (optional notify) | -> `resolved` |
| Ticket closed | -> `closed` | -> `closed` |
| Customer replies to resolved ticket | -> `open` | -> Reopen or create new |

#### 2.2 Socket.io Event Extensions
Add new events:
- `conversation_status_synced`: When sync rule triggers status change
- `unified_status_update`: Combined status for UI

### Phase 3: Frontend - Unified Status Display

#### 3.1 Create UnifiedStatusBadgeComponent
- Single component for both conversation and ticket statuses
- Color-coded based on combined state
- Shows primary status with secondary indicator if ticket exists

#### 3.2 Update ChatListComponent
- Simplify status filter to: All / Open / Active / Closed
- Add ticket indicator on conversations with linked tickets
- Show unified status badge

#### 3.3 Update ChatWindowComponent
- Add ticket status panel when conversation has linked ticket
- Show combined status information
- Quick actions for status transitions

### Phase 4: Testing & Documentation

#### 4.1 Testing Strategy
- Unit tests for statusSyncService
- Integration tests for sync scenarios
- E2E tests for UI status updates

#### 4.2 Documentation
- Update CLAUDE.md with new status system
- API documentation for sync endpoints
- Migration guide for existing data

---

## Acceptance Criteria

1. **Conversation statuses reduced to 3**: open, active, closed
2. **Ticket statuses remain unchanged**: 7 statuses for workflow tracking
3. **Automatic synchronization**: Customer message updates both entities
4. **Unified UI display**: Single status badge shows combined state
5. **Backward compatible**: Existing conversations migrate properly
6. **Real-time updates**: Socket.io events propagate status changes

---

## Clarifications & Decisions

### Pending Questions for User

1. **Conversation Reopen on Customer Reply**:
   - A) Automatically reopen closed conversations when customer messages
   - B) Create new conversation for customer messages to closed ones
   - C) Configurable behavior in system settings

2. **Ticket-Conversation Linking**:
   - A) One conversation can have multiple tickets (current)
   - B) One conversation = one active ticket at a time
   - C) Keep current but show "primary" ticket in UI

3. **Status Sync Direction**:
   - A) Bidirectional sync (changes propagate both ways)
   - B) Ticket-dominant (ticket status takes precedence)
   - C) Conversation-dominant (conversation status takes precedence)

4. **Migration Strategy**:
   - A) Migrate all historical data
   - B) Only migrate open/active conversations, archive rest
   - C) Soft migration (keep old statuses, add new field)

---

## Branch Strategy

- **Branch Name**: `feat/status-simplification`
- **Base Branch**: `develop` (create if doesn't exist from `main`)
- **Target Branch**: `develop`
- **Review Requirements**: 1 reviewer required

### Sub-branches (if needed)
- `feat/status-simplification-backend`: Backend changes
- `feat/status-simplification-frontend`: Frontend changes
- `feat/status-simplification-migration`: Data migration scripts

---

## Iteration History

### Iteration 1 (2025-12-29)
- Initial exploration completed
- Current architecture documented
- Team selected: nodejs-backend-architect, angular-frontend-developer
- Initial plan drafted
- Awaiting user clarification on 4 decision points
