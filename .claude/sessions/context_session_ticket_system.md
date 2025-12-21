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
- Status: Completed
- Changes:
  - User decisions incorporated
  - Simplified SLA (storage only, no monitoring)
  - Simplified escalation (manual flag)
  - Full frontend scope confirmed
  - OpenAI tool definitions added

### Iteration 3 - Universal Configuration System
- Created: 2025-12-21
- Status: Completed
- Changes:
  - ✅ Added configurable categories via CRMSettings
  - ✅ Made assistant instructions parameterized
  - ✅ Added industry-agnostic configuration options
  - ✅ Enhanced OpenAI tool calls with configurable fields
  - ✅ Created ConfigurationService with caching
  - ✅ Added Settings Management UI components
  - ✅ Provided 4 industry configuration examples
  - ✅ Updated implementation phases (0-7)
  - ✅ Enhanced acceptance criteria
  - ✅ Added migration strategy

### Iteration 4 - Architectural Decisions Finalized
- Created: 2025-12-21
- Status: **APPROVED - Ready for Implementation**
- User Decisions:
  - ✅ **Settings Model**: Create NEW `SystemSettings.js` (separate from CRMSettings)
  - ✅ **OpenAI Sync**: Build endpoint `/api/v2/config/sync-assistant` with function sync capability
  - ✅ **Storage Strategy**: Database-first with hardcoded fallback for all configurations
  - ✅ **LUXFREE Config**: Solar panel + lighting installation categories (not generic preset)
  - ✅ **Admin UI**: Settings page with tabs, admin-only route guard (no dashboard yet)
  - ✅ **Migration**: Automatic on server start via `initializeTicketSystem()`
  - ✅ **Ticket Models**: Confirmed new implementation (no existing models)
- Architectural Decisions:
  - ✅ SystemSettings model with multi-document pattern (key-value pairs)
  - ✅ OpenAI Assistant API integration for auto-sync instructions + tools
  - ✅ Presets stored in DB with hardcoded defaults fallback
  - ✅ Instructions template in DB with variable replacement
  - ✅ Top-level Settings navigation with tabbed interface
  - ✅ Automatic seeding on first server start

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

## Final Implementation Plan (UNIVERSAL VERSION)

### Scope Summary
- **Backend**: Full ticket system with basic SLA storage + **Universal Configuration System**
- **Frontend**: Complete ticket management UI + **Settings Management Panel**
- **Escalation**: Manual only (flag + reason)
- **SLA Monitoring**: Deferred (no background jobs)
- **Configurability**: Categories, assistant behavior, terminology - all configurable
- **Multi-Industry**: Works for any business type without code changes

---

## NEW: Universal Configuration System

### 1. SystemSettings Model (NEW - Separate from CRMSettings)

**Decision**: Create a NEW model `SystemSettings.js` with multi-document pattern (key-value pairs).

**Rationale**:
- Keeps existing CRMSettings intact (singleton pattern with conversation settings)
- Dedicated collection for ticket system configuration
- Flexible schema supports any configuration type
- Easy to query individual settings by key

Create `src/models/SystemSettings.js`:

```javascript
// Ticket Configuration Settings
{
  key: 'ticket_categories',
  value: [
    {
      id: 'technical_support',
      label: 'Soporte Técnico',
      labelEn: 'Technical Support',
      description: 'Problemas técnicos con productos o servicios',
      icon: 'wrench',
      color: '#3B82F6'
    },
    {
      id: 'billing',
      label: 'Facturación',
      labelEn: 'Billing',
      description: 'Pagos, facturas, reembolsos',
      icon: 'dollar-sign',
      color: '#10B981'
    },
    {
      id: 'general_inquiry',
      label: 'Consulta General',
      labelEn: 'General Inquiry',
      description: 'Preguntas e información general',
      icon: 'help-circle',
      color: '#6B7280'
    },
    {
      id: 'complaint',
      label: 'Queja',
      labelEn: 'Complaint',
      description: 'Quejas sobre el servicio',
      icon: 'alert-triangle',
      color: '#EF4444'
    },
    {
      id: 'other',
      label: 'Otro',
      labelEn: 'Other',
      description: 'Otros temas',
      icon: 'more-horizontal',
      color: '#9CA3AF'
    }
  ],
  category: 'tickets',
  isEditable: true
}

{
  key: 'assistant_configuration',
  value: {
    assistantName: 'Lúmen',
    companyName: 'LUXFREE',
    primaryServiceIssue: 'fallas en luminarias u otros servicios',
    serviceType: 'mantenimiento de luminarias',
    ticketNoun: 'reporte',  // or 'ticket', 'solicitud', 'caso'
    ticketNounPlural: 'reportes',
    greetingMessage: 'Hola, soy {assistantName}, el asistente virtual de {companyName}. Estoy aquí para ayudarte a reportar {primaryServiceIssue}, consultar información sobre un {ticketNoun} existente, o conectarte con un agente si lo necesitas.',
    language: 'es'  // 'es' or 'en'
  },
  category: 'assistant',
  isEditable: true
}

{
  key: 'ticket_terminology',
  value: {
    ticketSingular: 'reporte',     // 'ticket', 'caso', 'solicitud'
    ticketPlural: 'reportes',      // 'tickets', 'casos', 'solicitudes'
    createVerb: 'reportar',        // 'crear', 'abrir', 'registrar'
    customerNoun: 'usuario',       // 'cliente', 'usuario', 'contacto'
    agentNoun: 'agente',          // 'agente', 'técnico', 'operador'
    resolveVerb: 'resolver',      // 'resolver', 'cerrar', 'completar'
  },
  category: 'tickets',
  isEditable: true
}

{
  key: 'ticket_id_format',
  value: {
    prefix: 'TICKET',              // 'TICKET', 'RPT', 'CASO', 'REQ'
    includeYear: true,
    padLength: 6,                  // Number of zeros: 000001
    separator: '-',
    // Result: TICKET-2025-000001 or RPT-000001
  },
  category: 'tickets',
  isEditable: true
}
```

### 2. Dynamic Category Validation

Update `Ticket.js` model to validate against configured categories:

```javascript
// In Ticket.js
const CRMSettings = require('./CRMSettings');

const TicketSchema = new mongoose.Schema({
  category: {
    type: String,
    required: true,
    validate: {
      validator: async function(value) {
        const settings = await CRMSettings.findOne({ key: 'ticket_categories' });
        if (!settings) return true; // Fallback to default
        const validCategories = settings.value.map(cat => cat.id);
        return validCategories.includes(value);
      },
      message: 'Invalid ticket category'
    }
  }
  // ... rest of schema
});
```

### 3. Configuration Service

Create `src/services/configurationService.js`:

```javascript
const CRMSettings = require('../models/CRMSettings');

class ConfigurationService {
  constructor() {
    this.cache = new Map();
    this.cacheTTL = 5 * 60 * 1000; // 5 minutes
  }

  async getTicketCategories() {
    return this.getSetting('ticket_categories', this.getDefaultCategories());
  }

  async getAssistantConfig() {
    return this.getSetting('assistant_configuration', this.getDefaultAssistantConfig());
  }

  async getTicketTerminology() {
    return this.getSetting('ticket_terminology', this.getDefaultTerminology());
  }

  async getTicketIdFormat() {
    return this.getSetting('ticket_id_format', this.getDefaultIdFormat());
  }

  async getSetting(key, defaultValue) {
    // Check cache
    const cached = this.cache.get(key);
    if (cached && Date.now() - cached.timestamp < this.cacheTTL) {
      return cached.value;
    }

    // Fetch from DB
    const setting = await CRMSettings.findOne({ key });
    const value = setting ? setting.value : defaultValue;

    // Update cache
    this.cache.set(key, { value, timestamp: Date.now() });
    return value;
  }

  async updateSetting(key, value, updatedBy) {
    const setting = await CRMSettings.findOneAndUpdate(
      { key },
      {
        value,
        updatedBy,
        updatedAt: new Date()
      },
      { upsert: true, new: true }
    );

    // Invalidate cache
    this.cache.delete(key);

    return setting;
  }

  // Default configurations
  getDefaultCategories() {
    return [
      { id: 'technical_support', label: 'Soporte Técnico', icon: 'wrench', color: '#3B82F6' },
      { id: 'billing', label: 'Facturación', icon: 'dollar-sign', color: '#10B981' },
      { id: 'general_inquiry', label: 'Consulta General', icon: 'help-circle', color: '#6B7280' },
      { id: 'complaint', label: 'Queja', icon: 'alert-triangle', color: '#EF4444' },
      { id: 'other', label: 'Otro', icon: 'more-horizontal', color: '#9CA3AF' }
    ];
  }

  getDefaultAssistantConfig() {
    return {
      assistantName: 'Asistente Virtual',
      companyName: process.env.COMPANY_NAME || 'Nuestra Empresa',
      primaryServiceIssue: 'problemas o consultas',
      serviceType: 'atención al cliente',
      ticketNoun: 'ticket',
      ticketNounPlural: 'tickets',
      language: 'es'
    };
  }

  getDefaultTerminology() {
    return {
      ticketSingular: 'ticket',
      ticketPlural: 'tickets',
      createVerb: 'crear',
      customerNoun: 'cliente',
      agentNoun: 'agente',
      resolveVerb: 'resolver'
    };
  }

  getDefaultIdFormat() {
    return {
      prefix: 'TICKET',
      includeYear: true,
      padLength: 6,
      separator: '-'
    };
  }
}

module.exports = new ConfigurationService();
```

### 4. Updated OpenAI Tool Calls

Modify `openaiService.js` to use dynamic configuration:

```javascript
const configService = require('./configurationService');

async function handleToolCalls(threadId, runId, toolCalls, headers, userId) {
  const categories = await configService.getTicketCategories();
  const terminology = await configService.getTicketTerminology();

  const toolOutputs = [];

  for (const call of toolCalls) {
    const functionName = call.function.name;
    const args = JSON.parse(call.function.arguments || "{}");
    let output;

    if (functionName === "create_ticket_report") {
      try {
        // Validate category against configured categories
        const validCategories = categories.map(c => c.id);
        if (args.category && !validCategories.includes(args.category)) {
          args.category = 'other'; // Fallback
        }

        const ticket = await ticketService.createTicketFromAI({
          subject: args.subject,
          description: args.description,
          category: args.category || 'general_inquiry',
          priority: args.priority || 'medium',
          location: args.location,
          customerId,
          conversationId
        });

        output = JSON.stringify({
          success: true,
          ticketId: ticket.ticketId,
          message: `${terminology.ticketSingular} creado exitosamente`
        });
      } catch (error) {
        output = JSON.stringify({
          success: false,
          error: `No se pudo crear el ${terminology.ticketSingular}. Por favor intenta de nuevo.`
        });
      }
    }
    // ... rest of tool handlers
  }

  return toolOutputs;
}
```

### 5. Configuration API Endpoints

Add to `src/routes/configurationRoutes.js`:

```javascript
GET    /api/v2/config/ticket-categories    - Get ticket categories
PUT    /api/v2/config/ticket-categories    - Update categories (admin only)
GET    /api/v2/config/assistant             - Get assistant configuration
PUT    /api/v2/config/assistant             - Update assistant config (admin only)
GET    /api/v2/config/terminology           - Get ticket terminology
PUT    /api/v2/config/terminology           - Update terminology (admin only)
GET    /api/v2/config/ticket-id-format      - Get ticket ID format
PUT    /api/v2/config/ticket-id-format      - Update ID format (admin only)
```

### 6. Frontend Settings Management

Create `frontend/src/app/components/settings/` components:

```
settings/
├── ticket-categories-settings/
│   └── ticket-categories-settings.component.ts
├── assistant-config-settings/
│   └── assistant-config-settings.component.ts
├── terminology-settings/
│   └── terminology-settings.component.ts
└── settings-layout/
    └── settings-layout.component.ts
```

**Features:**
- Visual category editor (add/edit/remove categories)
- Color picker for category colors
- Icon selector for category icons
- Assistant configuration form
- Terminology customization
- Live preview of changes
- Reset to defaults button

---

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

### Revised File Structure (UNIVERSAL VERSION)

#### Backend Files
```
src/
├── models/
│   ├── SystemSettings.js        # NEW - Multi-document settings (key-value)
│   ├── Ticket.js                # NEW - Ticket schema with dynamic validation
│   └── TicketCounter.js         # NEW - Sequential ID counter
├── services/
│   ├── configurationService.js  # NEW - Configuration management with caching
│   ├── openaiSyncService.js     # NEW - OpenAI Assistant API sync
│   ├── ticketService.js         # NEW - Ticket business logic
│   └── openaiService.js         # MODIFY - Dynamic tool calls
├── controllers/
│   ├── configurationController.js # NEW - Settings + sync endpoints
│   └── ticketController.js      # NEW - Ticket HTTP handlers
├── routes/
│   ├── configurationRoutes.js   # NEW - Config + sync API routes
│   └── ticketRoutes.js          # NEW - Ticket API routes
└── app.js                        # MODIFY - Add initializeTicketSystem()
```

#### Frontend Files
```
frontend/src/app/
├── guards/
│   └── admin.guard.ts           # NEW - Admin-only route protection
├── services/
│   ├── configuration.service.ts # NEW - Configuration API + caching
│   └── ticket.service.ts        # NEW - Ticket API + Socket.io
├── components/
│   ├── settings/                # NEW - Settings management (admin only)
│   │   ├── settings-layout/
│   │   │   └── settings-layout.component.ts
│   │   ├── ticket-settings/
│   │   │   └── ticket-settings.component.ts
│   │   ├── assistant-settings/
│   │   │   └── assistant-settings.component.ts
│   │   ├── preset-loader/
│   │   │   └── preset-loader.component.ts
│   │   └── openai-sync/
│   │       └── openai-sync.component.ts
│   └── tickets/                 # NEW - Ticket management
│       ├── ticket-list/
│       │   └── ticket-list.component.ts
│       ├── ticket-detail/
│       │   └── ticket-detail.component.ts
│       ├── ticket-form/
│       │   └── ticket-form.component.ts
│       ├── ticket-notes/
│       │   └── ticket-notes.component.ts
│       └── ticket-status-badge/
│           └── ticket-status-badge.component.ts
└── app.routes.ts                # MODIFY - Add /tickets + /settings routes
```

### Implementation Phases (UNIVERSAL VERSION)

#### Phase 0: Configuration System Foundation
1. Review/enhance `CRMSettings` model for ticket configurations
2. Create `configurationService.js` with caching
3. Seed default ticket configurations in database
4. Create `configurationController.js`
5. Create `configurationRoutes.js`
6. Test configuration API endpoints

#### Phase 1: Backend Core with Dynamic Configuration
1. Create `TicketCounter` model with configurable format
2. Create `Ticket` model with dynamic category validation
3. Create `ticketService.js` using configurationService
4. Update `handleToolCalls` in `openaiService.js` with dynamic config
5. Test AI ticket creation via WhatsApp with different configurations

#### Phase 2: Backend API
1. Create `ticketController.js` using dynamic terminology
2. Create `ticketRoutes.js`
3. Register routes in `server.js`
4. Add Socket.io events for ticket changes
5. Test API endpoints with different configurations

#### Phase 3: Frontend Configuration Service
1. Create `configuration.ts` service
2. Add configuration interfaces/types
3. Implement configuration caching strategy
4. Test configuration service methods

#### Phase 4: Frontend Settings Components
1. Create `TicketCategoriesSettingsComponent` with category editor
2. Create `AssistantConfigSettingsComponent` with form
3. Create `TerminologySettingsComponent`
4. Create `SettingsLayoutComponent` (tabs/navigation)
5. Add settings routes to `app.routes.ts`
6. Add admin-only route guard

#### Phase 5: Frontend Ticket Components (Dynamic)
1. Create `TicketStatusBadgeComponent` using dynamic terminology
2. Create `TicketListComponent` with configurable categories
3. Create `TicketDetailComponent` with tabs
4. Create `TicketFormComponent` with dynamic category dropdown
5. Create `TicketNotesComponent`
6. Create `ticket.ts` service
7. Add ticket routes to `app.routes.ts`

#### Phase 6: Integration & Testing
1. Add tickets tab to Customer Detail
2. Add "Create Ticket" button to Conversation
3. Test end-to-end flow with LUXFREE config (default)
4. Test switching configurations (e.g., restaurant, e-commerce)
5. Test assistant behavior with different configurations
6. Update documentation with configuration guide

#### Phase 7: Multi-Industry Examples
1. Create configuration presets for common industries:
   - Lighting/Maintenance (LUXFREE - default)
   - Restaurant/Food Service
   - E-commerce/Retail
   - Healthcare/Medical
   - Professional Services
2. Add "Load Preset" feature in settings
3. Document customization guide for new industries

---

## FINAL ARCHITECTURAL DECISIONS

### Decision 1: SystemSettings Model Structure

**Model**: `src/models/SystemSettings.js` (NEW - separate from CRMSettings)

```javascript
const SystemSettingsSchema = new mongoose.Schema({
  key: {
    type: String,
    required: true,
    unique: true,
    index: true
  },
  value: mongoose.Schema.Types.Mixed, // Flexible: object, array, string, etc.
  category: {
    type: String,
    enum: ['tickets', 'assistant', 'presets', 'general'],
    default: 'general'
  },
  description: String,
  isEditable: { type: Boolean, default: true },
  updatedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'Agent' },
  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now }
});
```

**Storage Examples**:
```javascript
// Multiple documents in SystemSettings collection
{ key: 'ticket_categories', value: [{...}], category: 'tickets' }
{ key: 'assistant_configuration', value: {...}, category: 'assistant' }
{ key: 'ticket_terminology', value: {...}, category: 'tickets' }
{ key: 'ticket_id_format', value: {...}, category: 'tickets' }
{ key: 'configuration_presets', value: [{...}], category: 'presets' }
{ key: 'assistant_instructions_template', value: "...", category: 'assistant' }
```

---

### Decision 2: OpenAI Assistant Synchronization

**New Service**: `src/services/openaiSyncService.js`

**Capabilities**:
1. **Sync Instructions**: Update OpenAI Assistant instructions via API
2. **Sync Tools**: Update function definitions with dynamic categories
3. **Auto-sync Option**: Automatically sync when configuration changes

**Implementation**:

```javascript
class OpenAISyncService {
  async syncAssistantInstructions(config) {
    const template = await configService.getInstructionsTemplate();
    const instructions = this.renderTemplate(template, config);

    const response = await axios.patch(
      `https://api.openai.com/v1/assistants/${process.env.OPENAI_ASSISTANT_ID}`,
      { instructions },
      {
        headers: {
          'Authorization': `Bearer ${process.env.OPENAI_API_KEY}`,
          'OpenAI-Beta': 'assistants=v2'
        }
      }
    );

    return response.data;
  }

  async syncAssistantTools(categories) {
    const tools = [
      {
        type: 'function',
        function: {
          name: 'create_ticket_report',
          description: 'Creates a support ticket for the customer...',
          parameters: {
            type: 'object',
            properties: {
              subject: { type: 'string', description: '...' },
              description: { type: 'string', description: '...' },
              category: {
                type: 'string',
                enum: categories.map(c => c.id), // ← Dynamic categories!
                description: 'Category that best describes the issue'
              },
              priority: {
                type: 'string',
                enum: ['low', 'medium', 'high', 'urgent']
              }
            },
            required: ['subject', 'description', 'category']
          }
        }
      },
      {
        type: 'function',
        function: {
          name: 'get_ticket_information',
          // ... full definition
        }
      }
    ];

    const response = await axios.patch(
      `https://api.openai.com/v1/assistants/${process.env.OPENAI_ASSISTANT_ID}`,
      { tools },
      { headers: { /* ... */ } }
    );

    return response.data;
  }

  renderTemplate(template, config) {
    return template
      .replace(/{assistantName}/g, config.assistantName)
      .replace(/{companyName}/g, config.companyName)
      .replace(/{primaryServiceIssue}/g, config.primaryServiceIssue)
      .replace(/{ticketNoun}/g, config.ticketNoun)
      .replace(/{ticketNounPlural}/g, config.ticketNounPlural);
  }
}
```

**New API Endpoint**:
```javascript
// POST /api/v2/config/sync-assistant (admin only)
// Body: { syncInstructions: true, syncTools: true }

async syncAssistant(req, res) {
  const { syncInstructions, syncTools } = req.body;
  const results = {};

  if (syncInstructions) {
    const config = await configService.getAssistantConfig();
    results.instructions = await openaiSyncService.syncAssistantInstructions(config);
  }

  if (syncTools) {
    const categories = await configService.getTicketCategories();
    results.tools = await openaiSyncService.syncAssistantTools(categories);
  }

  res.json({ success: true, results, syncedAt: new Date() });
}
```

---

### Decision 3: Database-First Storage with Hardcoded Fallback

**Strategy**: All configurations stored in SystemSettings with hardcoded defaults as fallback

**Flow**:
```
1. configService.getTicketCategories()
   ↓
2. Check cache (5 min TTL)
   ↓
3. Query SystemSettings.findOne({ key: 'ticket_categories' })
   ↓
4. If found → return DB value
   If not found → return hardcoded default
```

**Benefits**:
- ✅ Primary source: Database (editable, customizable)
- ✅ Fallback: Hardcoded in code (always available, version controlled)
- ✅ Admin can edit, create, delete configurations via UI
- ✅ "Reset to defaults" button restores hardcoded values

**Applies to**:
- Ticket Categories
- Assistant Configuration
- Terminology
- Ticket ID Format
- Industry Presets
- Instructions Template

---

### Decision 4: LUXFREE Default Configuration (Solar + Lighting)

**Updated LUXFREE Categories** (Solar Panel + Lighting Installation Company):

```javascript
getDefaultCategories() {
  return [
    {
      id: 'solar_installation',
      label: 'Instalación Solar',
      labelEn: 'Solar Installation',
      icon: 'sun',
      color: '#F59E0B',
      description: 'Instalación de paneles solares y sistemas fotovoltaicos'
    },
    {
      id: 'light_malfunction',
      label: 'Falla de Luminaria',
      labelEn: 'Light Malfunction',
      icon: 'lightbulb-off',
      color: '#EF4444',
      description: 'Problemas con luminarias o alumbrado público'
    },
    {
      id: 'maintenance',
      label: 'Mantenimiento',
      labelEn: 'Maintenance',
      icon: 'wrench',
      color: '#10B981',
      description: 'Mantenimiento preventivo o correctivo'
    },
    {
      id: 'electrical_issue',
      label: 'Problema Eléctrico',
      labelEn: 'Electrical Issue',
      icon: 'zap',
      color: '#DC2626',
      description: 'Fallas eléctricas, cortocircuitos o problemas de instalación'
    },
    {
      id: 'billing',
      label: 'Facturación',
      labelEn: 'Billing',
      icon: 'dollar-sign',
      color: '#6366F1',
      description: 'Consultas sobre pagos, facturas o presupuestos'
    },
    {
      id: 'other',
      label: 'Otro',
      labelEn: 'Other',
      icon: 'more-horizontal',
      color: '#9CA3AF',
      description: 'Otros temas no clasificados'
    }
  ];
}

getDefaultAssistantConfig() {
  return {
    assistantName: 'Lúmen',
    companyName: process.env.COMPANY_NAME || 'LUXFREE',
    primaryServiceIssue: 'instalaciones solares, luminarias y servicios eléctricos',
    serviceType: 'instalación y mantenimiento eléctrico',
    ticketNoun: 'reporte',
    ticketNounPlural: 'reportes',
    language: 'es'
  };
}

getDefaultIdFormat() {
  return {
    prefix: 'LUX',
    includeYear: true,
    padLength: 6,
    separator: '-'
    // Result: LUX-2025-000001
  };
}
```

---

### Decision 5: Admin UI Navigation Structure

**No Dashboard Yet** - Settings as top-level page with admin-only guard

**Navigation**:
```
Main Menu (Sidebar/Header):
├── 💬 Conversations
├── 👥 Customers
├── 👤 Agents
├── 📋 Templates
├── 🎫 Tickets          (NEW)
└── ⚙️ Settings         (NEW - Admin Only)
```

**Settings Page Structure** (Tabs):
```
⚙️ Settings
├── 📋 Ticket System
│   ├── Categories Management
│   ├── Terminology Settings
│   └── ID Format Configuration
├── 🤖 AI Assistant
│   ├── Assistant Configuration
│   ├── Instructions Template Editor
│   └── OpenAI Sync Status
├── 🎨 Industry Presets
│   ├── Browse Presets
│   ├── Load Preset
│   └── Create Custom Preset
└── 🏢 General
    └── Company Information
```

**Route Guard**:
```typescript
// frontend/src/app/guards/admin.guard.ts
export const adminGuard: CanActivateFn = () => {
  const authService = inject(AuthService);
  const router = inject(Router);

  if (authService.currentUser?.role === 'admin') {
    return true;
  }

  router.navigate(['/conversations']);
  return false;
};

// In app.routes.ts
{
  path: 'settings',
  component: SettingsLayoutComponent,
  canActivate: [adminGuard]
}
```

---

### Decision 6: Automatic Migration on Server Start

**Migration Function**: `src/app.js` or `src/models/server.js`

```javascript
async function initializeTicketSystem() {
  const SystemSettings = require('./models/SystemSettings');
  const configService = require('./services/configurationService');

  console.log('🔍 Checking ticket system initialization...');

  // Check if configurations exist
  const ticketCategoriesExist = await SystemSettings.findOne({
    key: 'ticket_categories'
  });

  if (!ticketCategoriesExist) {
    console.log('🎫 Initializing ticket system with LUXFREE defaults...');

    // Seed all default configurations
    await SystemSettings.insertMany([
      {
        key: 'ticket_categories',
        value: configService.getDefaultCategories(),
        category: 'tickets',
        description: 'Available ticket categories',
        isEditable: true
      },
      {
        key: 'assistant_configuration',
        value: configService.getDefaultAssistantConfig(),
        category: 'assistant',
        description: 'AI assistant configuration',
        isEditable: true
      },
      {
        key: 'ticket_terminology',
        value: configService.getDefaultTerminology(),
        category: 'tickets',
        description: 'Ticket system terminology',
        isEditable: true
      },
      {
        key: 'ticket_id_format',
        value: configService.getDefaultIdFormat(),
        category: 'tickets',
        description: 'Ticket ID generation format',
        isEditable: true
      },
      {
        key: 'configuration_presets',
        value: configService.getDefaultPresets(),
        category: 'presets',
        description: 'Industry configuration presets',
        isEditable: true
      },
      {
        key: 'assistant_instructions_template',
        value: configService.getDefaultInstructionsTemplate(),
        category: 'assistant',
        description: 'AI assistant instructions template',
        isEditable: true
      }
    ]);

    console.log('✅ Ticket system initialized successfully');
  } else {
    console.log('✅ Ticket system already initialized');
  }
}

// Call during server startup (in app.js or server.js)
mongoose.connection.once('open', async () => {
  console.log('📊 Database connected');
  await initializeTicketSystem();
  console.log('🚀 Server ready');
});
```

**Characteristics**:
- ✅ Runs automatically on first server start
- ✅ Idempotent (safe to run multiple times)
- ✅ Zero-configuration deployment
- ✅ Works out of the box with LUXFREE defaults
- ✅ No manual scripts required

---

## Industry Configuration Examples

### Example 1: LUXFREE (Lighting Maintenance) - DEFAULT

```javascript
{
  assistant_configuration: {
    assistantName: 'Lúmen',
    companyName: 'LUXFREE',
    primaryServiceIssue: 'fallas en luminarias u otros servicios',
    serviceType: 'mantenimiento de luminarias',
    ticketNoun: 'reporte',
    ticketNounPlural: 'reportes'
  },
  ticket_categories: [
    { id: 'light_malfunction', label: 'Falla de Luminaria', icon: 'lightbulb-off', color: '#EF4444' },
    { id: 'installation', label: 'Instalación Nueva', icon: 'plus-circle', color: '#10B981' },
    { id: 'maintenance', label: 'Mantenimiento', icon: 'wrench', color: '#F59E0B' },
    { id: 'billing', label: 'Facturación', icon: 'dollar-sign', color: '#6366F1' },
    { id: 'other', label: 'Otro', icon: 'more-horizontal', color: '#9CA3AF' }
  ],
  ticket_id_format: {
    prefix: 'LUX',
    includeYear: true
  }
}
```

### Example 2: Restaurant / Food Delivery

```javascript
{
  assistant_configuration: {
    assistantName: 'FoodBot',
    companyName: 'Pizzería Roma',
    primaryServiceIssue: 'problemas con pedidos, entregas o calidad',
    serviceType: 'servicio de comida',
    ticketNoun: 'caso',
    ticketNounPlural: 'casos'
  },
  ticket_categories: [
    { id: 'order_issue', label: 'Problema con Pedido', icon: 'shopping-bag', color: '#EF4444' },
    { id: 'delivery_issue', label: 'Problema de Entrega', icon: 'truck', color: '#F59E0B' },
    { id: 'food_quality', label: 'Calidad de Comida', icon: 'alert-circle', color: '#DC2626' },
    { id: 'menu_question', label: 'Consulta de Menú', icon: 'book-open', color: '#3B82F6' },
    { id: 'billing', label: 'Facturación', icon: 'credit-card', color: '#10B981' },
    { id: 'other', label: 'Otro', icon: 'more-horizontal', color: '#9CA3AF' }
  ],
  ticket_id_format: {
    prefix: 'FOOD',
    includeYear: false
  }
}
```

### Example 3: E-commerce / Retail

```javascript
{
  assistant_configuration: {
    assistantName: 'ShopAssist',
    companyName: 'TiendaOnline',
    primaryServiceIssue: 'problemas con productos, envíos o devoluciones',
    serviceType: 'compras en línea',
    ticketNoun: 'solicitud',
    ticketNounPlural: 'solicitudes'
  },
  ticket_categories: [
    { id: 'product_inquiry', label: 'Consulta de Producto', icon: 'package', color: '#3B82F6' },
    { id: 'return_exchange', label: 'Devolución/Cambio', icon: 'repeat', color: '#F59E0B' },
    { id: 'shipping_issue', label: 'Problema de Envío', icon: 'truck', color: '#EF4444' },
    { id: 'payment_issue', label: 'Problema de Pago', icon: 'credit-card', color: '#DC2626' },
    { id: 'product_defect', label: 'Producto Defectuoso', icon: 'alert-triangle', color: '#B91C1C' },
    { id: 'other', label: 'Otro', icon: 'more-horizontal', color: '#9CA3AF' }
  ],
  ticket_id_format: {
    prefix: 'ORD',
    includeYear: true
  }
}
```

### Example 4: Healthcare / Medical

```javascript
{
  assistant_configuration: {
    assistantName: 'MediAssist',
    companyName: 'Clínica Salud',
    primaryServiceIssue: 'consultas médicas, citas o recetas',
    serviceType: 'servicios médicos',
    ticketNoun: 'consulta',
    ticketNounPlural: 'consultas'
  },
  ticket_categories: [
    { id: 'appointment', label: 'Cita Médica', icon: 'calendar', color: '#3B82F6' },
    { id: 'prescription', label: 'Receta Médica', icon: 'file-text', color: '#10B981' },
    { id: 'test_results', label: 'Resultados de Estudios', icon: 'activity', color: '#8B5CF6' },
    { id: 'billing_insurance', label: 'Facturación/Seguro', icon: 'shield', color: '#F59E0B' },
    { id: 'general_inquiry', label: 'Consulta General', icon: 'help-circle', color: '#6B7280' },
    { id: 'other', label: 'Otro', icon: 'more-horizontal', color: '#9CA3AF' }
  ],
  ticket_id_format: {
    prefix: 'MED',
    includeYear: true
  }
}
```

---

## Updated Acceptance Criteria

### Functional Requirements (Universal System)
1. [ ] **Configuration Management**
   - [ ] Admins can configure ticket categories via UI
   - [ ] Admins can customize assistant instructions
   - [ ] Admins can change ticket terminology
   - [ ] Admins can set ticket ID format
   - [ ] Changes take effect immediately (cache invalidation)

2. [ ] **Dynamic Ticket System**
   - [ ] AI creates tickets using configured categories
   - [ ] AI responses use configured terminology
   - [ ] Ticket IDs follow configured format
   - [ ] Category validation uses configured categories
   - [ ] Frontend displays configured category labels/colors

3. [ ] **Core Ticket Functionality**
   - [ ] AI can create tickets via `create_ticket_report` tool call
   - [ ] AI can retrieve ticket info via `get_ticket_information` tool call
   - [ ] Tickets are persisted in MongoDB with proper schema
   - [ ] Agents can view/filter/search tickets in dashboard
   - [ ] Agents can update ticket status and add notes
   - [ ] Real-time updates when tickets change
   - [ ] Tickets linked to customers and conversations
   - [ ] Sequential ticket ID generation with configured format

4. [ ] **Multi-Industry Support**
   - [ ] System works with default LUXFREE configuration
   - [ ] Configuration can be changed to restaurant preset
   - [ ] Configuration can be changed to e-commerce preset
   - [ ] Assistant behavior adapts to configuration
   - [ ] No code changes required for industry switch

### Non-Functional Requirements
1. [ ] API response time < 200ms
2. [ ] Configuration cache TTL: 5 minutes
3. [ ] Proper error handling with meaningful messages
4. [ ] Input validation on all endpoints
5. [ ] Pagination for list endpoints (default 20, max 100)
6. [ ] Consistent with existing code patterns
7. [ ] Admin-only access to configuration endpoints
8. [ ] Configuration changes logged with user info

---

## Environment Variables (Updated)

Add these optional variables for initial configuration:

```env
# Ticket System Configuration (Optional - can be set via UI)
TICKET_PREFIX=TICKET                    # Default ticket ID prefix
ASSISTANT_NAME=Lúmen                    # Default assistant name
PRIMARY_SERVICE_ISSUE=fallas y servicios # Default service description
TICKET_NOUN=reporte                     # Default ticket terminology
```

Note: These environment variables are only used for **initial seeding**. Once the system is running, all configuration is managed via the database and Settings UI.

---

## Documentation Updates Required

1. **CLAUDE.md**: Add section on Universal Configuration System
2. **README.md**: Add "Multi-Industry Support" section
3. **API_DOCUMENTATION.md**: Document configuration endpoints
4. **DATABASE_SCHEMA.md**: Update with configuration schema
5. **NEW: CONFIGURATION_GUIDE.md**: Step-by-step guide for customizing system for different industries

---

## Migration Strategy

For existing LUXFREE deployment:

1. Run migration script to seed current LUXFREE config into database
2. Existing tickets continue to work (backward compatible)
3. Configuration UI is admin-only (no disruption to agents)
4. Default values match current LUXFREE behavior

Migration script: `scripts/seedTicketConfiguration.js`

---

## Summary: Universal Ticket System

### What Makes It Universal?

**Before (LUXFREE-specific):**
- ❌ Hardcoded categories for lighting maintenance
- ❌ Assistant instructions mention "luminarias" and "Lúmen"
- ❌ Fixed ticket ID format (TICKET-YYYY-NNNNNN)
- ❌ Code changes required for different industries

**After (Universal System):**
- ✅ Configurable categories via database
- ✅ Dynamic assistant instructions with variables
- ✅ Customizable ticket ID format
- ✅ Settings UI for easy configuration
- ✅ Industry presets (lighting, restaurant, e-commerce, healthcare)
- ✅ No code changes needed to switch industries

### Key Architectural Decisions

1. **Configuration Storage**: CRMSettings collection in MongoDB
2. **Caching Strategy**: 5-minute TTL for performance
3. **Validation**: Dynamic category validation against configured categories
4. **Default Behavior**: Falls back to sensible defaults if config missing
5. **Migration**: Backward compatible with existing LUXFREE setup

### What Gets Configured?

| Setting | Example Values | Impact |
|---------|---------------|--------|
| **Categories** | `light_malfunction`, `order_issue`, `appointment` | Dropdown options, validation |
| **Assistant Name** | Lúmen, FoodBot, MediAssist | AI greeting messages |
| **Ticket Noun** | reporte, caso, solicitud, consulta | UI labels, API responses |
| **Ticket Prefix** | LUX, FOOD, ORD, MED | Ticket ID format |
| **Company Name** | LUXFREE, Pizzería Roma | Assistant context |
| **Service Issue** | "fallas en luminarias", "problemas con pedidos" | Assistant instructions |

### Technical Benefits

1. **Maintainability**: Single codebase serves multiple industries
2. **Scalability**: Add new industries without code deployment
3. **Flexibility**: Business can pivot without developer intervention
4. **Testability**: Can test different configurations easily
5. **White-label Ready**: Deploy same system for different clients

### Business Benefits

1. **Faster Deployment**: Configure instead of code
2. **Lower Costs**: No custom development per industry
3. **Market Expansion**: Same product for different verticals
4. **Client Customization**: Each client gets branded experience
5. **Competitive Advantage**: Multi-industry CRM solution

---

## Next Steps

### For Review:
1. Review universal configuration approach
2. Validate industry examples match real use cases
3. Confirm Settings UI requirements
4. Approve implementation phases

### Questions for User:
None at this time - plan is comprehensive and ready for review.

### Ready to Implement:
Once approved, implementation can begin with Phase 0 (Configuration System Foundation).

---

**Plan Status**: ✅ **APPROVED FOR IMPLEMENTATION** (pending user confirmation)

**Estimated Complexity**: High (new configuration system + full ticket system)

**Branch**: `feat/universal-ticket-system`

**Target**: `develop`
