# Conversation Status Management - Implementation Guide

## Overview

This document describes the complete conversation status management system implemented in the WhatsApp Meta Bot CRM. The system provides full visibility and control over conversation lifecycle states with real-time updates via Socket.io.

## Status Flow

```
open → assigned → resolved → closed
  ↓       ↓          ↓
  └───────┴──────────┴─→ (can reopen to 'open')
```

### Status Definitions

| Status | Description | Color Code | Icon | Who Can Set |
|--------|-------------|------------|------|-------------|
| **open** | Conversation handled by AI | Blue | `fa-circle` | System |
| **assigned** | Assigned to human agent | Yellow | `fa-user-tie` | Agent/System |
| **waiting** | Waiting for response | Orange | `fa-clock` | System |
| **resolved** | Agent marked as resolved | Green | `fa-check-circle` | Agent |
| **closed** | Final closed state | Gray | `fa-lock` | Agent/Admin/System |

## Backend Implementation

### API Endpoints

All endpoints are under `/api/v2/conversations/:id/` and require authentication.

#### 1. Resolve Conversation
```
POST /api/v2/conversations/:id/resolve
Body: { resolutionNotes?: string }
```
- Marks conversation as **resolved**
- Sends confirmation to customer (if enabled in CRM settings)
- Updates `resolvedAt`, `resolvedBy` timestamps
- Emits Socket.io event: `conversation_updated`

#### 2. Close Conversation
```
POST /api/v2/conversations/:id/close
Body: { reason?: string, force?: boolean }
```
- Transitions from **resolved** → **closed**
- Admin can force-close from any status
- Releases agent assignment
- Disables AI
- Emits Socket.io event: `conversation_updated`

#### 3. Reopen Conversation
```
POST /api/v2/conversations/:id/reopen
Body: { reason?: string }
```
- **Admin/Supervisor only**
- Transitions from **closed** → **open**
- Re-enables AI
- Clears resolution timestamps
- Emits Socket.io event: `conversation_updated`

### Database Model

**File**: `src/models/Conversation.js`

```javascript
{
  status: {
    type: String,
    enum: ['open', 'assigned', 'waiting', 'resolved', 'closed'],
    default: 'open',
    index: true
  },
  resolvedAt: Date,
  resolvedBy: { type: ObjectId, ref: 'Agent' },
  resolutionNotes: String,
  closedAt: Date
}
```

### Lifecycle Service

**File**: `src/services/conversationLifecycleService.js`

Key functions:
- `resolveConversation(conversationId, agentId, resolutionNotes)`
- `closeConversation(conversationId, agentId, reason, force)`
- `reopenConversation(conversationId, agentId, reason)`
- `handleResolutionConfirmation(conversationId, confirmed)`

### Auto-Timeout Service

**File**: `src/services/autoTimeoutService.js`

Background process that automatically:
1. Checks for stale conversations (no activity for 24h default)
2. Marks `assigned` conversations as `resolved`
3. Transitions `resolved` → `closed` after confirmation timeout
4. Configurable per-conversation timeout periods

## Frontend Implementation

### 1. Status Badge Component

**File**: `frontend/src/app/components/shared/status-badge/status-badge.ts`

Reusable component that displays color-coded status badges.

**Usage**:
```html
<app-status-badge [status]="chat.status" size="sm"></app-status-badge>
```

**Props**:
- `status`: 'open' | 'assigned' | 'waiting' | 'resolved' | 'closed'
- `size`: 'sm' | 'md' | 'lg'

**Features**:
- Color-coded backgrounds (blue, yellow, orange, green, gray)
- Icons for each status
- Tooltips with status descriptions
- Dark mode support

### 2. Conversation List Enhancements

**File**: `frontend/src/app/components/chat/chat-list/`

**New Features**:

#### Status Filter Dropdown
```html
<select [(ngModel)]="statusFilter">
  <option value="all">All</option>
  <option value="open">Open</option>
  <option value="assigned">Assigned</option>
  <option value="waiting">Waiting</option>
  <option value="resolved">Resolved</option>
  <option value="closed">Closed</option>
</select>
```

#### Status Badge in List Items
Each conversation now displays:
- Status badge (small size)
- Real-time status updates via Socket.io

**Filtering Logic**:
```typescript
getDisplayChats(): Observable<Chat[]> {
  let baseChats$ = /* tab-filtered chats */;

  if (this.statusFilter !== 'all') {
    return baseChats$.pipe(
      map(chats => chats.filter(chat => chat.status === this.statusFilter))
    );
  }
  return baseChats$;
}
```

### 3. Chat Window Enhancements

**File**: `frontend/src/app/components/chat/chat-window/`

**Header Updates**:
- Status badge next to customer name
- Status-aware action buttons

**Action Buttons** (context-aware):

#### When status = 'assigned' and assigned to current agent:
```html
<button (click)="resolveConversation(chat.id)">
  Mark Resolved
</button>
```

#### When status = 'resolved' and assigned to current agent:
```html
<button (click)="closeConversation(chat.id)">
  Close Conversation
</button>
```

#### When status = 'closed' (admin/supervisor only):
```html
<button (click)="reopenConversation(chat.id)">
  Reopen Conversation
</button>
```

### 4. Chat Service Updates

**File**: `frontend/src/app/services/chat.ts`

New methods:
```typescript
resolveConversation(conversationId: string, resolutionNotes?: string): Observable<any>
closeConversation(conversationId: string, reason?: string): Observable<any>
reopenConversation(conversationId: string, reason?: string): Observable<any>
```

## Real-Time Updates (Socket.io)

### Events Emitted by Backend

#### 1. conversation_updated
```javascript
io.emit('conversation_updated', {
  conversationId: '...',
  status: 'resolved',
  resolvedBy: 'agent@example.com'
});
```

**Triggers**:
- Status change (resolve, close, reopen)
- Assignment changes
- Priority updates

#### 2. conversation_resolved
```javascript
io.emit('conversation_resolved', {
  conversationId: '...',
  resolvedBy: agentId,
  resolvedAt: timestamp
});
```

#### 3. conversation_closed
```javascript
io.emit('conversation_closed', {
  conversationId: '...',
  closedBy: agentId
});
```

### Frontend Socket Listeners

**File**: `frontend/src/app/services/chat.ts`

```typescript
this.socket.on('conversation_updated', (data: any) => {
  const chat = this.mockChats.find(c => c.id === data.conversationId);
  if (chat) {
    chat.status = data.status;
    this.chatsSubject.next([...this.mockChats]);
  }
});
```

## Translation Support

### English (en-US.json)
```json
{
  "status": {
    "open": "Open",
    "assigned": "Assigned",
    "waiting": "Waiting",
    "resolved": "Resolved",
    "closed": "Closed"
  },
  "chat": {
    "markResolved": "Mark Resolved",
    "resolving": "Resolving...",
    "closeConversation": "Close Conversation",
    "closing": "Closing...",
    "reopenConversation": "Reopen Conversation",
    "reopening": "Reopening...",
    "filterByStatus": "Filter by status"
  }
}
```

### Spanish (es-MX.json)
```json
{
  "status": {
    "open": "Abierto",
    "assigned": "Asignado",
    "waiting": "Esperando",
    "resolved": "Resuelto",
    "closed": "Cerrado"
  },
  "chat": {
    "markResolved": "Marcar como resuelto",
    "resolving": "Resolviendo...",
    "closeConversation": "Cerrar conversación",
    "closing": "Cerrando...",
    "reopenConversation": "Reabrir conversación",
    "reopening": "Reabriendo...",
    "filterByStatus": "Filtrar por estado"
  }
}
```

## User Workflows

### Agent Workflow

1. **Take Over Conversation**
   - Conversation status: `open` → `assigned`
   - Agent sees "Mark Resolved" button

2. **Resolve Issue**
   - Click "Mark Resolved"
   - Status: `assigned` → `resolved`
   - Customer receives confirmation message (optional)
   - Button changes to "Close Conversation"

3. **Close Conversation**
   - Click "Close Conversation"
   - Confirm dialog appears
   - Status: `resolved` → `closed`
   - Agent is unassigned
   - AI is disabled

4. **Resume AI** (at any point before closing)
   - Click "Resume AI"
   - Status: `assigned` → `open`
   - AI takes over

### Admin Workflow

1. **Reopen Closed Conversation**
   - Only visible for closed conversations
   - Only for admin/supervisor role
   - Click "Reopen Conversation"
   - Status: `closed` → `open`
   - AI re-enabled

### Customer Workflow

1. **Resolution Confirmation** (if enabled in settings)
   - Agent marks as resolved
   - Customer receives WhatsApp interactive buttons:
     - ✅ "Sí, resuelto" (Yes, resolved)
     - ❌ "No, necesito ayuda" (No, I need help)

2. **Customer confirms resolved**:
   - Status: `resolved` → `closed` (if auto-close enabled)

3. **Customer says not resolved**:
   - Status: `resolved` → `assigned`
   - Reassignment count incremented
   - Auto-escalates to urgent if threshold reached

## Status Visibility

### Conversation List
- ✅ Status badge displayed for each conversation
- ✅ Filter dropdown to show only specific statuses
- ✅ Tab filters (Queue/My Chats/All) work with status filter
- ✅ Real-time badge updates when status changes

### Chat Window Header
- ✅ Status badge next to customer name
- ✅ Context-aware action buttons based on status
- ✅ Agent assignment indicator
- ✅ AI status indicator

### Reports & Analytics
- Status is tracked in conversation history
- Assignment history includes status transitions
- Analytics can filter by status

## Permission Model

| Action | Agent | Supervisor | Admin |
|--------|-------|------------|-------|
| Resolve (own conversations) | ✅ | ✅ | ✅ |
| Close (resolved conversations) | ✅ | ✅ | ✅ |
| Force Close (any status) | ❌ | ❌ | ✅ |
| Reopen closed conversations | ❌ | ✅ | ✅ |

## Testing Checklist

- [x] Status badge displays correctly in conversation list
- [x] Status filter dropdown works
- [x] Status badge displays in chat header
- [x] "Mark Resolved" button shows when appropriate
- [x] "Close Conversation" button shows after resolved
- [x] "Reopen" button shows for admin/supervisor on closed conversations
- [x] Real-time status updates via Socket.io
- [x] Frontend build successful
- [x] Translation keys for English and Spanish

## Files Modified

### Backend
- ✅ `src/controllers/conversationController.js` - Already had endpoints
- ✅ `src/services/conversationLifecycleService.js` - Already implemented
- ✅ `src/routes/conversationRoutes.js` - Already had routes
- ✅ `src/models/Conversation.js` - Already had status fields

### Frontend
- ✅ `frontend/src/app/components/shared/status-badge/status-badge.ts` - **NEW**
- ✅ `frontend/src/app/components/chat/chat-list/chat-list.ts` - Enhanced with filter
- ✅ `frontend/src/app/components/chat/chat-list/chat-list.html` - Added filter & badge
- ✅ `frontend/src/app/components/chat/chat-window/chat-window.ts` - Added badge import
- ✅ `frontend/src/app/components/chat/chat-window/chat-window.html` - Added badge display
- ✅ `frontend/src/app/services/chat.ts` - Already had status methods
- ✅ `frontend/src/assets/i18n/en-US.json` - Added status translations
- ✅ `frontend/src/assets/i18n/es-MX.json` - Added status translations

## Next Steps (Optional Enhancements)

1. **Status History Timeline**
   - Show when status changed and by whom
   - Display in conversation details modal

2. **Bulk Status Operations**
   - Select multiple conversations
   - Bulk resolve/close

3. **Custom Status Reasons**
   - Dropdown for common resolution reasons
   - Analytics on closure reasons

4. **SLA Indicators**
   - Show time in each status
   - Highlight if approaching SLA breach

5. **Status-Based Notifications**
   - Desktop notifications for status changes
   - Email notifications for resolved conversations

## Troubleshooting

### Status not updating in real-time
- Check Socket.io connection in browser console
- Verify `io.emit('conversation_updated')` is called in backend
- Check network tab for WebSocket frames

### Filter not working
- Verify `statusFilter` is bound correctly with `[(ngModel)]`
- Check FormsModule is imported in component
- Verify `getDisplayChats()` filter logic

### Buttons not showing
- Check conversation status value
- Verify agent assignment (`isAssignedToMe()`)
- Check role permissions for reopen button

## Configuration

### CRM Settings (Database)

```javascript
{
  resolutionConfirmation: {
    enabled: true,
    messageTemplate: "¿Tu consulta fue resuelta?",
    autoCloseOnConfirm: true
  },
  autoTimeout: {
    enabled: true,
    timeout: 86400000, // 24 hours in ms
    customTimeouts: {
      [conversationId]: 3600000 // 1 hour for specific conversation
    }
  }
}
```

## Performance Considerations

- Status filter operates client-side on already-loaded conversations
- Socket.io events update only affected conversations (no full reload)
- Status badge component is lightweight (no API calls)
- Filter state is not persisted (resets on page refresh)

## Security Notes

- All status change endpoints require authentication
- Role-based access control for reopen (admin/supervisor only)
- Force-close restricted to admin role only
- Agent can only resolve/close conversations assigned to them

---

**Implementation Date**: December 20, 2025
**Status**: ✅ Complete and Deployed
**Build Status**: ✅ Frontend compiled successfully (859.61 kB)
