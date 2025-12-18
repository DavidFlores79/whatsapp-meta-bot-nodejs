# Ticket System Implementation Plan

## Session Information
- **Feature**: CRM Ticket System for AI Tool Calls
- **Created**: 2025-12-18
- **Status**: Planning Phase

---

## Exploration Summary

### Current State Analysis

#### 1. handleToolCalls Function (openaiService.js:214-235)
The current implementation has **placeholder logic** for two tool functions:

```javascript
async function handleToolCalls(threadId, runId, toolCalls, headers, userId) {
  const toolOutputs = [];
  for (const call of toolCalls) {
    const functionName = call.function.name;
    const args = JSON.parse(call.function.arguments || "{}");
    let output = JSON.stringify({ success: true }); // Default

    // Implement tool logic here (ticket creation, etc.)
    if (functionName === "create_ticket_report") {
      output = JSON.stringify({ success: true, ticketId: `TICKET-${Date.now()}`, message: "Ticket created" });
    } else if (functionName === "get_ticket_information") {
      output = JSON.stringify({ success: true, status: "open", description: "Sample ticket info" });
    }

    toolOutputs.push({ tool_call_id: call.id, output });
  }
  // ... submit tool outputs to OpenAI
}
```

**Issues Identified:**
- No actual ticket persistence (just generates fake ID)
- No Ticket model exists in the project
- No ticket-related API endpoints
- No frontend components for ticket management
- `get_ticket_information` returns static sample data

#### 2. Existing Database Schema (Already Designed but Not Implemented)
From `docs/DATABASE_SCHEMA.md`, a comprehensive Ticket schema was already designed:
- ticketId (unique, format: TICKET-YYYY-NNNNNN)
- Links to Customer, Conversation, Agent
- Category, Priority, Status, SLA tracking
- Attachments, Location, Resolution info
- Customer feedback, Notes, Tags
- Escalation tracking, Related tickets

#### 3. Related Existing Models
| Model | Relationship to Tickets |
|-------|------------------------|
| Customer | 1:N (customer has many tickets) - Already has `statistics.totalTickets` |
| Conversation | 1:N (conversation can spawn tickets) |
| Agent | 1:N (agent handles tickets) |
| Message | Reference for ticket context |

#### 4. Existing CRM Implementation Plan
From `docs/CRM_IMPLEMENTATION_PLAN.md`:
- Ticket routes already planned: `/api/v2/tickets/*`
- Socket events planned: `ticket:created`, `ticket:updated`, `ticket:resolved`, `ticket:note_added`
- Controller methods defined: `getTickets()`, `getTicket()`, `updateTicket()`, `resolveTicket()`, `addTicketNote()`

---

## Team Selection

### Selected Subagents for Advice Phase:

| Subagent | Purpose | Specific Questions |
|----------|---------|-------------------|
| **nodejs-backend-architect** | Backend implementation | - Ticket model design & validation<br>- Service layer architecture<br>- Tool call integration pattern<br>- Error handling strategy<br>- Ticket ID generation (sequential vs UUID) |
| **angular-frontend-developer** | Frontend implementation | - Ticket list/detail components<br>- State management approach<br>- Real-time updates via Socket.io<br>- UI/UX for ticket creation flow |

---

## Implementation Plan

### Phase 1: Backend - Ticket Model & Service

#### 1.1 Create Ticket Model (`src/models/Ticket.js`)
Based on the existing schema design with CRM best practices:
- Sequential ticket ID generation (TICKET-2025-000001)
- Status workflow: open → in_progress → waiting_customer → resolved → closed
- Priority levels: low, medium, high, urgent
- Categories aligned with business needs
- SLA tracking fields
- Internal notes system
- Customer feedback collection

#### 1.2 Create Ticket Service (`src/services/ticketService.js`)
- `createTicket(data)` - Create new ticket with auto-generated ID
- `getTicketById(ticketId)` - Fetch ticket with populated references
- `getTicketsByCustomer(customerId)` - Customer's ticket history
- `getTicketsByAgent(agentId)` - Agent's assigned tickets
- `updateTicket(ticketId, updates)` - Update ticket fields
- `addNote(ticketId, note)` - Add internal/external note
- `resolveTicket(ticketId, resolution)` - Mark as resolved
- `escalateTicket(ticketId, escalation)` - Escalate to supervisor
- `generateTicketId()` - Sequential ID generation

#### 1.3 Integrate with OpenAI Tool Calls
Update `handleToolCalls` in `openaiService.js`:

**create_ticket_report:**
- Extract: subject, description, category, priority, location
- Link to: customerId (from userId/phone), conversationId
- Return: actual ticketId, status, estimated resolution

**get_ticket_information:**
- Query by ticketId or customer phone
- Return: status, description, notes, resolution status
- Support multiple ticket lookup

### Phase 2: Backend - API Routes

#### 2.1 Create Ticket Routes (`src/routes/ticketRoutes.js`)
```
GET    /api/v2/tickets              - List tickets (with filters, pagination)
GET    /api/v2/tickets/:id          - Get single ticket
POST   /api/v2/tickets              - Create ticket (manual creation by agent)
PUT    /api/v2/tickets/:id          - Update ticket
POST   /api/v2/tickets/:id/notes    - Add note
PUT    /api/v2/tickets/:id/resolve  - Resolve ticket
PUT    /api/v2/tickets/:id/escalate - Escalate ticket
GET    /api/v2/customers/:id/tickets - Customer's tickets
GET    /api/v2/conversations/:id/tickets - Conversation's tickets
```

#### 2.2 Create Ticket Controller (`src/controllers/ticketController.js`)
- Input validation with proper error responses
- Pagination for list endpoints
- Search and filtering capabilities
- Permission checks (agent can only see assigned/unassigned)

### Phase 3: Backend - Real-time Events

#### 3.1 Socket.io Events
```javascript
'ticket:created'     // New ticket created (by AI or agent)
'ticket:updated'     // Ticket status/priority changed
'ticket:assigned'    // Ticket assigned to agent
'ticket:resolved'    // Ticket marked as resolved
'ticket:note_added'  // New note added to ticket
'ticket:escalated'   // Ticket escalated
```

### Phase 4: Frontend - Angular Components

#### 4.1 Ticket Service (`frontend/src/app/services/ticket.ts`)
- HTTP methods for all API endpoints
- Socket.io event subscriptions
- Local state caching

#### 4.2 Components Structure
```
frontend/src/app/components/tickets/
├── ticket-list/           # List view with filters
│   └── ticket-list.ts
├── ticket-detail/         # Single ticket view
│   └── ticket-detail.ts
├── ticket-form/           # Create/edit form
│   └── ticket-form.ts
├── ticket-notes/          # Notes section
│   └── ticket-notes.ts
└── ticket-status-badge/   # Status indicator
    └── ticket-status-badge.ts
```

#### 4.3 Route Integration
Add to `app.routes.ts`:
```typescript
{ path: 'tickets', component: TicketListComponent },
{ path: 'tickets/:id', component: TicketDetailComponent }
```

#### 4.4 Integration Points
- **Customer Detail**: Show customer's ticket history
- **Conversation Window**: Show related tickets, quick ticket creation
- **Dashboard**: Ticket statistics widget

---

## Branch Strategy

| Field | Value |
|-------|-------|
| **Branch Name** | `feat/ticket-system` |
| **Base Branch** | `develop` (create if doesn't exist from `main`) |
| **Target Branch** | `develop` |
| **Merge Strategy** | Squash merge with PR |
| **Review Requirements** | 1 reviewer required |

---

## Technology-Specific Decisions

### Backend (Node.js/Express)
- **Ticket ID Generation**: Counter-based sequential (TICKET-2025-NNNNNN)
- **Validation**: Joi schema validation (consistent with existing patterns)
- **Error Handling**: Centralized error handler with proper HTTP status codes
- **Database**: MongoDB with Mongoose (consistent with existing models)

### Frontend (Angular 21)
- **State Management**: Service-based with RxJS (no NgRx - keep it simple)
- **Styling**: Tailwind CSS (consistent with existing components)
- **Components**: Standalone components (Angular 21 default)
- **Forms**: Reactive Forms with strict typing

---

## File Structure

### New Backend Files
```
src/
├── models/
│   └── Ticket.js           # NEW
├── services/
│   └── ticketService.js    # NEW
├── controllers/
│   └── ticketController.js # NEW
├── routes/
│   └── ticketRoutes.js     # NEW
└── services/
    └── openaiService.js    # MODIFY (handleToolCalls)
```

### New Frontend Files
```
frontend/src/app/
├── services/
│   └── ticket.ts           # NEW
├── components/
│   └── tickets/
│       ├── ticket-list/
│       │   └── ticket-list.ts    # NEW
│       ├── ticket-detail/
│       │   └── ticket-detail.ts  # NEW
│       ├── ticket-form/
│       │   └── ticket-form.ts    # NEW
│       └── ticket-notes/
│           └── ticket-notes.ts   # NEW
└── app.routes.ts           # MODIFY
```

---

## Acceptance Criteria

### Functional Requirements
1. [ ] AI can create tickets via `create_ticket_report` tool call
2. [ ] AI can retrieve ticket info via `get_ticket_information` tool call
3. [ ] Tickets are persisted in MongoDB with proper schema
4. [ ] Agents can view/filter/search tickets in dashboard
5. [ ] Agents can update ticket status and add notes
6. [ ] Real-time updates when tickets change
7. [ ] Tickets linked to customers and conversations
8. [ ] Sequential ticket ID generation (TICKET-YYYY-NNNNNN)

### Non-Functional Requirements
1. [ ] API response time < 200ms
2. [ ] Proper error handling with meaningful messages
3. [ ] Input validation on all endpoints
4. [ ] Pagination for list endpoints (default 20, max 100)
5. [ ] Consistent with existing code patterns

---

## Testing Strategy

### Backend Tests
- Unit tests for ticketService methods
- Integration tests for API endpoints
- Tool call integration test with mock OpenAI

### Frontend Tests
- Component unit tests with Jasmine/Karma
- Service tests with HttpClientTestingModule
- E2E tests with Playwright (if available)

---

## Documentation Requirements

- Update CLAUDE.md with ticket system info
- Update API_DOCUMENTATION.md with new endpoints
- Update DATABASE_SCHEMA.md if schema changes

---

## Advice Phase Notes

### Backend Architect Recommendations

#### 1. Ticket ID Generation Strategy
**Recommendation: MongoDB Counter Collection** (Atomic operations)
```javascript
// TicketCounter model - simple counter document
{ _id: "ticket", year: 2025, sequence: 0 }

// Atomic increment with findOneAndUpdate
const counter = await TicketCounter.findOneAndUpdate(
  { _id: 'ticket', year: currentYear },
  { $inc: { sequence: 1 } },
  { upsert: true, new: true }
);
// Result: TICKET-2025-000001
```
- No Redis needed (keeps architecture simple)
- Race-condition safe via atomic MongoDB operations
- Year-based auto-reset capability

#### 2. Ticket Status Workflow (8-State Lifecycle)
```
NEW → OPEN → IN_PROGRESS → PENDING_CUSTOMER → RESOLVED → CLOSED
                    ↓
              WAITING_INTERNAL (optional)
```
**Status Transitions:**
- `new` → `open` (agent reviews)
- `open` → `in_progress` (agent starts work)
- `in_progress` → `pending_customer` (awaiting response)
- `pending_customer` → `in_progress` (customer replies - auto)
- `in_progress` → `resolved` (solution provided)
- `resolved` → `closed` (customer confirms or timeout)
- Any status can escalate without changing status (escalation is a flag)

**Track Status History:**
```javascript
statusHistory: [{
  from: String,
  to: String,
  changedBy: ObjectId,
  changedAt: Date,
  reason: String
}]
```

#### 3. OpenAI Tool Call Integration
**Synchronous processing** with robust error handling:
- Always return valid JSON to OpenAI (never throw)
- Validate AI-provided data before creating tickets
- User-friendly Spanish error messages
- Security: customers can only access their own tickets via phone lookup

```javascript
// create_ticket_report handler
try {
  const ticket = await ticketService.createTicketFromAI({
    subject: args.subject,
    description: args.description,
    category: args.category || 'general_inquiry',
    priority: args.priority || 'medium',
    customerId, // resolved from userId/phone
    conversationId // from context
  });
  return { success: true, ticketId: ticket.ticketId, message: "Ticket creado exitosamente" };
} catch (error) {
  return { success: false, error: "No se pudo crear el ticket. Por favor intenta de nuevo." };
}
```

#### 4. Service Layer Architecture
**Single source of truth** - all ticket operations through ticketService:
- `createTicketFromAI(data)` - AI-initiated creation
- `createTicketFromAgent(data, agentId)` - Agent-initiated
- `getTicketById(ticketId)` - With populated refs
- `getTicketByIdForCustomer(ticketId, customerId)` - Secure customer access
- `updateTicketStatus(ticketId, newStatus, agentId, reason)` - With history
- `assignTicket(ticketId, agentId)` - Assignment with notification
- `addNote(ticketId, content, agentId, isInternal)` - Notes system
- `resolveTicket(ticketId, resolution, agentId)` - Resolution workflow
- `escalateTicket(ticketId, toAgentId, reason)` - Escalation

**Socket.io events emitted FROM service layer** (not controllers):
```javascript
// In ticketService.js
io.emit('ticket_created', { ticket, customerId });
io.emit('ticket_updated', { ticketId, changes, updatedBy });
```

#### 5. SLA Tracking (Priority-Based)
| Priority | First Response | Resolution Target |
|----------|---------------|-------------------|
| **Urgent** | 15 min | 4 hours |
| **High** | 1 hour | 24 hours |
| **Medium** | 4 hours | 72 hours |
| **Low** | 24 hours | 7 days |

**Implementation:**
- Store targets in ticket based on priority at creation
- Background job (every 15 min) checks for SLA breaches
- Emit `ticket_sla_warning` at 75% of deadline
- Emit `ticket_sla_breach` when breached
- Pause SLA timer when status is `pending_customer`

#### 6. Ticket Categories (7 Categories)
```javascript
categories: [
  'technical_support',  // Product/system issues
  'billing',            // Payments, invoices, refunds
  'account',            // Login, access, profile
  'general_inquiry',    // Questions, information
  'complaint',          // Service complaints
  'feature_request',    // Enhancement requests
  'other'               // Catch-all
]
```
- Hardcoded enum for consistency
- Subcategory field (String) for flexibility
- Tags array for additional classification

---

### Frontend Developer Recommendations

#### 1. State Management
**Decision: Services + RxJS BehaviorSubjects** (NO NgRx, NO Signals)
- Consistent with existing `ChatService` and `AuthService` patterns
- Simple and performant for this scale
- Optimistic updates for instant UI feedback

```typescript
// ticket.service.ts
private ticketsSubject = new BehaviorSubject<Ticket[]>([]);
public tickets$ = this.ticketsSubject.asObservable();

private selectedTicketSubject = new BehaviorSubject<Ticket | null>(null);
public selectedTicket$ = this.selectedTicketSubject.asObservable();
```

**Caching Strategy:**
- 5-minute TTL for ticket list
- Invalidate on socket events
- Optimistic updates for user actions

#### 2. Component Architecture (Smart/Dumb Pattern)
**Smart Components (Pages):**
- `TicketListPage` - Data fetching, navigation
- `TicketDetailPage` - Ticket operations, routing

**Dumb Components (Presentational):**
- `TicketListComponent` - Display list, emit events
- `TicketCardComponent` - Single ticket card
- `TicketFormComponent` - Create/edit form
- `TicketNotesComponent` - Notes timeline
- `TicketStatusBadgeComponent` - Status pill

**Ticket Detail Layout:** Tabs pattern
- Tab 1: Overview (status, priority, description)
- Tab 2: Notes & Activity
- Tab 3: Related (customer, conversation links)

#### 3. Real-time Updates (Socket.io)
**Events to listen:**
```typescript
this.socket.on('ticket_created', (data) => this.handleTicketCreated(data));
this.socket.on('ticket_updated', (data) => this.handleTicketUpdated(data));
this.socket.on('ticket_note_added', (data) => this.handleNoteAdded(data));
this.socket.on('ticket_assigned', (data) => this.handleTicketAssigned(data));
this.socket.on('ticket_status_changed', (data) => this.handleStatusChanged(data));
```

**UI Update Strategy:**
- Service handlers update BehaviorSubjects
- Components subscribe via async pipe
- Toast notifications for background changes

#### 4. Forms (Typed ReactiveForms)
```typescript
interface TicketFormValue {
  subject: string;
  description: string;
  category: TicketCategory;
  subcategory?: string;
  priority: TicketPriority;
  tags: string[];
}

this.ticketForm = this.fb.group<TicketFormValue>({
  subject: ['', [Validators.required, Validators.maxLength(200)]],
  description: ['', [Validators.required]],
  category: ['general_inquiry', Validators.required],
  priority: ['medium', Validators.required],
  tags: [[]]
});
```

**Dynamic validation:** Subcategory required for certain categories

#### 5. UI/UX Patterns (Tailwind CSS)

**Status Badges:**
```html
<span class="px-2 py-1 text-xs font-medium rounded-full"
      [ngClass]="{
        'bg-gray-100 text-gray-800': status === 'new',
        'bg-blue-100 text-blue-800': status === 'open',
        'bg-yellow-100 text-yellow-800': status === 'in_progress',
        'bg-purple-100 text-purple-800': status === 'pending_customer',
        'bg-green-100 text-green-800': status === 'resolved',
        'bg-gray-200 text-gray-600': status === 'closed'
      }">
  {{ status | titlecase }}
</span>
```

**Priority Indicators:**
- Low: Gray icon, subtle styling
- Medium: Blue icon
- High: Orange icon, bold text
- Urgent: Red icon, pulsing dot animation

**Timeline for Notes:**
```html
<div class="relative pl-8 border-l-2 border-gray-200">
  <div *ngFor="let note of notes" class="mb-4 relative">
    <div class="absolute -left-10 w-4 h-4 rounded-full bg-blue-500"></div>
    <div class="bg-white p-3 rounded-lg shadow-sm">
      <p class="text-sm">{{ note.content }}</p>
      <span class="text-xs text-gray-500">{{ note.timestamp | timeAgo }}</span>
    </div>
  </div>
</div>
```

#### 6. Integration Points

**Customer Detail Page:**
- Add "Tickets" tab showing customer's ticket history
- Quick "Create Ticket" button pre-fills customer info

**Conversation Window:**
- "Create Ticket" button in chat header
- Pre-fills conversation context and customer
- Side panel shows related tickets

**Navigation:**
- Ticket → Conversation link
- Ticket → Customer link
- Bidirectional navigation

---

### CRM Industry Standards (Research Summary)

#### Standard Status Lifecycle
```
NEW → OPEN → PENDING → IN_PROGRESS → RESOLVED → CLOSED
```
- "On Hold" and "Escalated" should be flags, not statuses
- Keep workflow linear for clarity

#### Priority-Based SLA Standards
| Priority | First Response | Resolution |
|----------|---------------|------------|
| P1 Critical | 15-30 min | 2-4 hours |
| P2 High | 1-2 hours | 8-24 hours |
| P3 Medium | 4-8 hours | 24-72 hours |
| P4 Low | 12-24 hours | 72+ hours |

#### Escalation Triggers (Automatic)
1. SLA breach risk (75% of deadline)
2. VIP/Enterprise customer
3. Keywords detected: "urgent", "broken", "can't access"
4. 3+ similar tickets (system-wide issue)
5. Highly negative sentiment

#### Best Practices
- Limit to 5-7 categories (avoid granularity)
- Pause SLA timer during customer wait
- Track escalation rate per agent (target <5%)
- Keep full context on escalation

---

## Iterations

### Iteration 1 - Initial Plan
- Created: 2025-12-18
- Status: Completed
- Changes: Initial plan with expert recommendations integrated

### Iteration 2 - Final Plan
- Created: 2025-12-18
- Status: **APPROVED - Ready for Implementation**
- Changes:
  - User decisions incorporated
  - Simplified SLA (storage only, no monitoring)
  - Simplified escalation (manual flag)
  - Full frontend scope confirmed
  - OpenAI tool definitions added

---

## User Decisions (Answered)

| Question | Decision |
|----------|----------|
| **Categories** | Use recommended: `technical_support`, `billing`, `account`, `general_inquiry`, `complaint`, `feature_request`, `other` |
| **SLA Scope** | Basic SLA storage (store targets, no automatic monitoring) |
| **Escalation** | Simple flag + manual agent reassignment |
| **Frontend** | Full implementation (list, detail, create, notes, filters) |
| **OpenAI Tools** | Include JSON tool definitions |

---

## Final Implementation Plan

### Scope Summary
- **Backend**: Full ticket system with basic SLA storage
- **Frontend**: Complete ticket management UI
- **Escalation**: Manual only (flag + reason)
- **SLA Monitoring**: Deferred (no background jobs)

### OpenAI Assistant Tool Definitions

Add these to your OpenAI Assistant configuration:

```json
{
  "name": "create_ticket_report",
  "description": "Creates a support ticket for the customer. Use when the customer reports an issue, requests help, or needs follow-up on a problem. The ticket will be tracked and assigned to an agent.",
  "parameters": {
    "type": "object",
    "properties": {
      "subject": {
        "type": "string",
        "description": "Brief summary of the issue (max 200 chars)"
      },
      "description": {
        "type": "string",
        "description": "Detailed description of the customer's issue or request"
      },
      "category": {
        "type": "string",
        "enum": ["technical_support", "billing", "account", "general_inquiry", "complaint", "feature_request", "other"],
        "description": "Category that best describes the issue"
      },
      "priority": {
        "type": "string",
        "enum": ["low", "medium", "high", "urgent"],
        "description": "Priority level based on issue severity. Use 'urgent' only for critical issues."
      }
    },
    "required": ["subject", "description", "category"]
  }
}
```

```json
{
  "name": "get_ticket_information",
  "description": "Retrieves information about a customer's support ticket. Use when customer asks about ticket status, wants updates, or references a previous issue.",
  "parameters": {
    "type": "object",
    "properties": {
      "ticket_id": {
        "type": "string",
        "description": "The ticket ID (format: TICKET-YYYY-NNNNNN). Optional if looking up by recent tickets."
      },
      "lookup_recent": {
        "type": "boolean",
        "description": "Set to true to retrieve the customer's most recent tickets instead of a specific one"
      }
    },
    "required": []
  }
}
```

### Revised File Structure

#### Backend Files
```
src/
├── models/
│   ├── Ticket.js           # NEW - Ticket schema
│   └── TicketCounter.js    # NEW - Sequential ID counter
├── services/
│   ├── ticketService.js    # NEW - Business logic
│   └── openaiService.js    # MODIFY - handleToolCalls
├── controllers/
│   └── ticketController.js # NEW - HTTP handlers
└── routes/
    └── ticketRoutes.js     # NEW - API routes
```

#### Frontend Files
```
frontend/src/app/
├── services/
│   └── ticket.ts           # NEW - API + Socket service
├── components/
│   └── tickets/
│       ├── ticket-list/
│       │   └── ticket-list.ts
│       ├── ticket-detail/
│       │   └── ticket-detail.ts
│       ├── ticket-form/
│       │   └── ticket-form.ts
│       ├── ticket-notes/
│       │   └── ticket-notes.ts
│       └── ticket-status-badge/
│           └── ticket-status-badge.ts
└── app.routes.ts           # MODIFY - Add ticket routes
```

### Implementation Phases

#### Phase 1: Backend Core (Priority)
1. Create `TicketCounter` model
2. Create `Ticket` model with all fields
3. Create `ticketService.js` with core methods
4. Update `handleToolCalls` in `openaiService.js`
5. Test AI ticket creation via WhatsApp

#### Phase 2: Backend API
1. Create `ticketController.js`
2. Create `ticketRoutes.js`
3. Register routes in `server.js`
4. Add Socket.io events for ticket changes
5. Test API endpoints

#### Phase 3: Frontend Service
1. Create `ticket.ts` service
2. Add interfaces/types
3. Setup Socket.io listeners
4. Test service methods

#### Phase 4: Frontend Components
1. Create `TicketStatusBadgeComponent`
2. Create `TicketListComponent` with filters
3. Create `TicketDetailComponent` with tabs
4. Create `TicketFormComponent`
5. Create `TicketNotesComponent`
6. Add routes to `app.routes.ts`

#### Phase 5: Integration
1. Add tickets tab to Customer Detail
2. Add "Create Ticket" button to Conversation
3. Test end-to-end flow
4. Update documentation
