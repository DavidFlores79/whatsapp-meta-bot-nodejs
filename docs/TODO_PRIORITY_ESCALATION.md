# TODO: Integrate Priority Escalation into Message Handlers

## Overview
Integrate the priority escalation service into the message handling flow to automatically escalate conversations based on keywords, wait time, VIP status, and reassignments.

## Tasks

### 1. Update Message Handlers
**File:** `src/handlers/messageHandlers.js`

Add priority escalation check after message is saved:

```javascript
// In handleTextMessage function, after saving message:
const priorityEscalationService = require('../services/priorityEscalationService');

// Check for escalation keywords in message content
await priorityEscalationService.checkMessageForEscalation(conversationId, text);
```

### 2. Update Auto-Timeout Service
**File:** `src/services/autoTimeoutService.js`

Replace hardcoded timeouts with configurable CRM settings:

```javascript
const CRMSettings = require('../models/CRMSettings');

// In timeout check:
const settings = await CRMSettings.getSettings();
const timeoutThreshold = settings.getTimeoutForStatus(conversation.status);

// Use timeoutThreshold instead of hardcoded 24 hours
```

### 3. Add Scheduled Priority Escalation Check
**File:** `src/services/autoTimeoutService.js` or create new scheduler

Add periodic check for wait time escalation:

```javascript
const priorityEscalationService = require('../services/priorityEscalationService');

// Run every 5 minutes
setInterval(async () => {
  await priorityEscalationService.checkAllConversationsForEscalation();
}, 5 * 60 * 1000);
```

### 4. Update Assignment Service
**File:** `src/services/agentAssignmentService.js`

In the transfer/assign methods, increment reassignment count:

```javascript
// In transferConversation:
conversation.reassignmentCount = (conversation.reassignmentCount || 0) + 1;

// Check for escalation after reassignment
const priorityEscalationService = require('../services/priorityEscalationService');
await priorityEscalationService.checkAndEscalate(conversationId);
```

### 5. Add SLA Tracking
**File:** `src/services/agentAssignmentService.js`

Track first response time when agent first replies:

```javascript
// In assignConversation or first agent reply:
const CRMSettings = require('../models/CRMSettings');
const settings = await CRMSettings.getSettings();

if (!conversation.sla) {
  conversation.sla = {
    firstResponseTarget: settings.sla.firstResponseTime,
    resolutionTarget: settings.sla.resolutionTime
  };
}

// On first agent response:
if (!conversation.sla.firstResponseAt) {
  conversation.sla.firstResponseAt = new Date();
  const responseTime = Date.now() - conversation.createdAt.getTime();
  conversation.sla.firstResponseMet = responseTime <= conversation.sla.firstResponseTarget;
}
```

### 6. Socket.io Events
**File:** `src/services/priorityEscalationService.js`

Already implemented! Events are emitted on escalation:
- `conversation_escalated` - Notify frontend of priority change

### 7. Frontend Updates (Optional - Future)
Add priority badges and escalation indicators in the conversation list:
- Display priority as colored badge (low=gray, medium=blue, high=orange, urgent=red)
- Show SLA breach warning icons
- Allow manual priority setting by supervisor/admin

## Testing Checklist

- [ ] Send message with urgent keyword → Priority escalates to urgent
- [ ] Send message with high keyword → Priority escalates to high
- [ ] Leave conversation assigned for >30min → Priority escalates
- [ ] Transfer conversation 2+ times → Escalates to urgent
- [ ] VIP customer creates conversation → Auto-escalates to high
- [ ] Auto-timeout uses configurable settings from CRMSettings
- [ ] First response time tracked correctly
- [ ] Resolution time tracked correctly

## Notes

- All escalation rules are configurable in the CRMSettings model
- Escalation history is tracked in `conversation.priorityHistory`
- Priority can never be downgraded, only upgraded
- Admins can manually set priority via `/api/v2/conversations/:id/priority` endpoint
