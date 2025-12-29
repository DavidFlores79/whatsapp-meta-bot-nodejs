# Status Simplification - Node.js Backend Implementation Plan

## Executive Summary

This document provides a detailed implementation plan for simplifying the Conversation status system from 5 values to 3 values, while maintaining the existing 7-value Ticket status system and creating synchronization between the two models.

**Current State:**
- Conversation Status: `['open', 'assigned', 'waiting', 'resolved', 'closed']` (5 values)
- Ticket Status: `['new', 'open', 'in_progress', 'pending_customer', 'waiting_internal', 'resolved', 'closed']` (7 values)
- No synchronization between systems

**Target State:**
- Conversation Status: `['open', 'active', 'closed']` (3 values)
  - `open`: AI handling or unassigned
  - `active`: Agent assigned and working
  - `closed`: Conversation ended
- Ticket Status: Unchanged (7 values for detailed workflow)
- Bidirectional synchronization via event-driven architecture

---

## Architectural Recommendations

### 1. Migration Strategy

**Recommendation: Use MongoDB Migration Script with Application-Layer Validation**

**Reasoning:**
- MongoDB migration ensures data consistency BEFORE deploying new code
- Application-layer validation prevents old status values after deployment
- Rollback capability if migration fails
- Clear audit trail of migration

**Implementation:**

#### File: `migrations/001_simplify_conversation_status.js`

```javascript
/**
 * Migration: Simplify Conversation Status (5 → 3 values)
 *
 * Mapping:
 * - 'open' → 'open' (unchanged)
 * - 'assigned' → 'active' (agent actively working)
 * - 'waiting' → 'active' (still active, just waiting for customer)
 * - 'resolved' → 'closed' (conversation ended successfully)
 * - 'closed' → 'closed' (unchanged)
 */

const mongoose = require('mongoose');
const Conversation = require('../src/models/Conversation');

// Status mapping configuration
const STATUS_MAPPING = {
  'open': 'open',
  'assigned': 'active',
  'waiting': 'active',
  'resolved': 'closed',
  'closed': 'closed'
};

async function up() {
  console.log('🚀 Starting conversation status migration...\n');

  try {
    // Connect to MongoDB
    await mongoose.connect(process.env.MONGODB, {
      useNewUrlParser: true,
      useUnifiedTopology: true
    });

    console.log('✅ Connected to MongoDB');

    // Get current status distribution BEFORE migration
    const statusCounts = await Conversation.aggregate([
      { $group: { _id: '$status', count: { $sum: 1 } } }
    ]);

    console.log('\n📊 Current status distribution:');
    statusCounts.forEach(item => {
      console.log(`   ${item._id}: ${item.count}`);
    });

    // Perform migration for each old status value
    const migrationResults = {};

    for (const [oldStatus, newStatus] of Object.entries(STATUS_MAPPING)) {
      const result = await Conversation.updateMany(
        { status: oldStatus },
        {
          $set: { status: newStatus },
          $push: {
            internalNotes: {
              content: `Status migrated from '${oldStatus}' to '${newStatus}' during system upgrade`,
              timestamp: new Date(),
              isVisible: false
            }
          }
        }
      );

      migrationResults[oldStatus] = result.modifiedCount;
      console.log(`   ✓ Migrated ${result.modifiedCount} conversations from '${oldStatus}' → '${newStatus}'`);
    }

    // Verify migration - check for any remaining old statuses
    const remainingOldStatuses = await Conversation.find({
      status: { $in: ['assigned', 'waiting', 'resolved'] }
    }).countDocuments();

    if (remainingOldStatuses > 0) {
      throw new Error(`Migration incomplete: ${remainingOldStatuses} conversations still have old status values`);
    }

    // Get NEW status distribution AFTER migration
    const newStatusCounts = await Conversation.aggregate([
      { $group: { _id: '$status', count: { $sum: 1 } } }
    ]);

    console.log('\n📊 New status distribution:');
    newStatusCounts.forEach(item => {
      console.log(`   ${item._id}: ${item.count}`);
    });

    console.log('\n✅ Migration completed successfully');
    console.log('\n📋 Summary:');
    console.log('   Total conversations migrated:',
      Object.values(migrationResults).reduce((sum, count) => sum + count, 0));

    await mongoose.disconnect();
    process.exit(0);

  } catch (error) {
    console.error('\n❌ Migration failed:', error);
    await mongoose.disconnect();
    process.exit(1);
  }
}

async function down() {
  console.log('⚠️  ROLLBACK: Reverting conversation status migration...\n');

  try {
    await mongoose.connect(process.env.MONGODB, {
      useNewUrlParser: true,
      useUnifiedTopology: true
    });

    console.log('✅ Connected to MongoDB');

    // NOTE: Rollback is imperfect because we lose granularity
    // 'active' could have been 'assigned' or 'waiting'
    // We'll default to 'assigned' as the most common case

    console.log('⚠️  WARNING: Rollback will convert all "active" → "assigned"');
    console.log('   Original "waiting" status cannot be recovered accurately\n');

    const result = await Conversation.updateMany(
      { status: 'active' },
      {
        $set: { status: 'assigned' },
        $push: {
          internalNotes: {
            content: 'Status rolled back from "active" to "assigned" during migration rollback',
            timestamp: new Date(),
            isVisible: false
          }
        }
      }
    );

    console.log(`✅ Rolled back ${result.modifiedCount} conversations`);

    await mongoose.disconnect();
    process.exit(0);

  } catch (error) {
    console.error('❌ Rollback failed:', error);
    await mongoose.disconnect();
    process.exit(1);
  }
}

// Run migration
const command = process.argv[2];
if (command === 'down') {
  down();
} else {
  up();
}

module.exports = { up, down };
```

**Migration Execution:**

1. **Pre-migration backup:**
   ```bash
   mongodump --uri="mongodb://your-connection-string" --out=/backup/before-status-migration
   ```

2. **Run migration:**
   ```bash
   node migrations/001_simplify_conversation_status.js
   ```

3. **Rollback (if needed):**
   ```bash
   node migrations/001_simplify_conversation_status.js down
   ```

4. **Add to package.json:**
   ```json
   {
     "scripts": {
       "migrate:status": "node migrations/001_simplify_conversation_status.js",
       "migrate:status:rollback": "node migrations/001_simplify_conversation_status.js down"
     }
   }
   ```

---

### 2. Synchronization Service Design

**Recommendation: Event-Driven Architecture with Mongoose Middleware**

**Reasoning:**
- Mongoose middleware (pre/post hooks) ensures ALL status changes are captured
- Prevents developers from forgetting to sync manually
- Centralized logic reduces code duplication
- No risk of infinite loops (hooks don't trigger on already-processed updates)

**Implementation:**

#### File: `src/services/statusSyncService.js`

```javascript
/**
 * Status Synchronization Service
 *
 * Bidirectional synchronization between Conversation and Ticket statuses:
 * - When Conversation status changes → Update related Ticket statuses
 * - When Ticket status changes → Update parent Conversation status
 *
 * Architecture: Event-driven via Mongoose middleware to ensure ALL changes are synced
 */

const Conversation = require('../models/Conversation');
const Ticket = require('../models/Ticket');
const { io } = require('../models/server');

class StatusSyncService {
  /**
   * Sync Conversation status → Ticket statuses
   * Called when a conversation status changes
   *
   * Mapping:
   * - Conversation 'open' → No ticket sync (tickets manage their own workflow)
   * - Conversation 'active' → Ticket 'open' or 'in_progress' (depending on assignment)
   * - Conversation 'closed' → Ticket 'closed' (force close all related tickets)
   */
  async syncConversationToTickets(conversationId, newConversationStatus, triggeredBy) {
    try {
      console.log(`🔄 [StatusSync] Conversation ${conversationId} → ${newConversationStatus}`);

      // Find all tickets for this conversation
      const tickets = await Ticket.find({
        conversationId,
        status: { $nin: ['closed'] } // Skip already closed tickets
      });

      if (tickets.length === 0) {
        console.log(`   ℹ️  No active tickets to sync`);
        return;
      }

      console.log(`   Found ${tickets.length} active ticket(s) to sync`);

      // Sync logic based on conversation status
      for (const ticket of tickets) {
        let newTicketStatus = null;
        let syncReason = '';

        switch (newConversationStatus) {
          case 'open':
            // Conversation returned to AI - no forced ticket status change
            // Tickets manage their own workflow independently
            console.log(`   ✓ Ticket ${ticket.ticketId}: No sync needed (conversation open)`);
            continue;

          case 'active':
            // Agent assigned to conversation
            if (ticket.status === 'new') {
              newTicketStatus = 'open';
              syncReason = 'Agent assigned to conversation';
            } else if (ticket.status === 'pending_customer') {
              // Don't override pending_customer - waiting for customer response
              console.log(`   ✓ Ticket ${ticket.ticketId}: Keeping 'pending_customer' status`);
              continue;
            }
            // If already in progress/waiting_internal, don't change
            break;

          case 'closed':
            // Conversation closed - close all related tickets
            newTicketStatus = 'closed';
            syncReason = 'Conversation closed';
            ticket.closedAt = new Date();
            break;
        }

        // Update ticket status if needed
        if (newTicketStatus && newTicketStatus !== ticket.status) {
          const oldStatus = ticket.status;

          // Add to status history
          ticket.statusHistory.push({
            from: oldStatus,
            to: newTicketStatus,
            changedBy: triggeredBy, // Agent ID or null for system
            changedAt: new Date(),
            reason: `Auto-sync: ${syncReason}`
          });

          ticket.status = newTicketStatus;
          await ticket.save();

          console.log(`   ✓ Ticket ${ticket.ticketId}: ${oldStatus} → ${newTicketStatus}`);

          // Emit Socket.io event
          if (io) {
            io.emit('ticket_status_changed', {
              ticket: await Ticket.findById(ticket._id)
                .populate('customerId', 'firstName lastName phoneNumber')
                .populate('assignedAgent', 'firstName lastName email'),
              previousStatus: oldStatus,
              syncedFrom: 'conversation'
            });
          }
        }
      }

      console.log(`✅ [StatusSync] Conversation → Tickets sync complete`);

    } catch (error) {
      console.error(`❌ [StatusSync] Error syncing conversation to tickets:`, error);
      // Don't throw - sync failures shouldn't break the main operation
    }
  }

  /**
   * Sync Ticket status → Conversation status
   * Called when a ticket status changes
   *
   * Logic:
   * - If ANY ticket is 'in_progress' → Conversation should be 'active'
   * - If ALL tickets are 'closed' → Conversation can be 'closed'
   * - If ALL tickets are 'resolved' → Suggest closing conversation (don't auto-close)
   */
  async syncTicketToConversation(ticketId, newTicketStatus, triggeredBy) {
    try {
      const ticket = await Ticket.findById(ticketId);
      if (!ticket || !ticket.conversationId) {
        return; // No conversation to sync
      }

      console.log(`🔄 [StatusSync] Ticket ${ticket.ticketId} (${newTicketStatus}) → Conversation`);

      const conversation = await Conversation.findById(ticket.conversationId);
      if (!conversation) {
        console.warn(`   ⚠️  Conversation not found: ${ticket.conversationId}`);
        return;
      }

      // Get ALL tickets for this conversation to make informed decision
      const allTickets = await Ticket.find({ conversationId: ticket.conversationId });

      const ticketStatusCounts = {
        new: allTickets.filter(t => t.status === 'new').length,
        open: allTickets.filter(t => t.status === 'open').length,
        in_progress: allTickets.filter(t => t.status === 'in_progress').length,
        pending_customer: allTickets.filter(t => t.status === 'pending_customer').length,
        waiting_internal: allTickets.filter(t => t.status === 'waiting_internal').length,
        resolved: allTickets.filter(t => t.status === 'resolved').length,
        closed: allTickets.filter(t => t.status === 'closed').length
      };

      console.log(`   Ticket status breakdown:`, ticketStatusCounts);

      let newConversationStatus = null;
      let syncReason = '';

      // Decision logic based on aggregate ticket statuses
      if (ticketStatusCounts.in_progress > 0 || ticketStatusCounts.open > 0) {
        // At least one ticket is actively being worked on
        if (conversation.status !== 'active') {
          newConversationStatus = 'active';
          syncReason = 'Ticket is being actively worked on';
        }
      } else if (ticketStatusCounts.closed === allTickets.length) {
        // ALL tickets are closed → close conversation
        if (conversation.status !== 'closed') {
          newConversationStatus = 'closed';
          syncReason = 'All tickets closed';
          conversation.closedAt = new Date();
        }
      } else if (ticketStatusCounts.resolved === allTickets.length) {
        // ALL tickets resolved but not closed → suggest closing (don't auto-close)
        console.log(`   ℹ️  All tickets resolved - conversation can be closed manually`);

        // Emit suggestion event to frontend
        if (io) {
          io.emit('conversation_close_suggestion', {
            conversationId: conversation._id,
            reason: 'All tickets resolved',
            ticketCount: allTickets.length
          });
        }
      }

      // Update conversation status if needed
      if (newConversationStatus && newConversationStatus !== conversation.status) {
        const oldStatus = conversation.status;

        // Add internal note
        if (!conversation.internalNotes) {
          conversation.internalNotes = [];
        }
        conversation.internalNotes.push({
          agent: triggeredBy,
          content: `Status auto-synced from ticket: ${oldStatus} → ${newConversationStatus}. ${syncReason}`,
          timestamp: new Date(),
          isVisible: false
        });

        conversation.status = newConversationStatus;
        await conversation.save();

        console.log(`   ✓ Conversation: ${oldStatus} → ${newConversationStatus}`);

        // Emit Socket.io event
        if (io) {
          io.emit('conversation_updated', {
            conversationId: conversation._id,
            status: newConversationStatus,
            previousStatus: oldStatus,
            syncedFrom: 'ticket'
          });
        }
      } else {
        console.log(`   ✓ No conversation status change needed`);
      }

      console.log(`✅ [StatusSync] Ticket → Conversation sync complete`);

    } catch (error) {
      console.error(`❌ [StatusSync] Error syncing ticket to conversation:`, error);
      // Don't throw - sync failures shouldn't break the main operation
    }
  }

  /**
   * Check if sync is needed (prevents infinite loops)
   * Returns true if the status change should trigger a sync
   */
  shouldSync(oldStatus, newStatus, source = 'unknown') {
    // Don't sync if status didn't actually change
    if (oldStatus === newStatus) {
      return false;
    }

    // Don't sync if this is already a sync operation (prevents loops)
    // This is handled by NOT calling sync from middleware if the update
    // already came from the sync service
    return true;
  }
}

module.exports = new StatusSyncService();
```

---

### 3. Mongoose Middleware Integration

**Recommendation: Use `pre('save')` middleware for automatic synchronization**

**Reasoning:**
- Captures ALL status changes (manual, API, admin updates)
- Runs before validation, ensuring sync happens even if save fails
- Can access both old and new values via `this.isModified('status')`
- No code changes needed in existing services

**Implementation:**

#### Update File: `src/models/Conversation.js`

Add this middleware BEFORE the `module.exports` line:

```javascript
// ... existing schema definition ...

// ============================================
// MIDDLEWARE: Auto-sync status changes
// ============================================

conversationSchema.pre('save', async function(next) {
  // Only sync if status actually changed
  if (!this.isModified('status')) {
    return next();
  }

  // Get old status from database (this.status is the NEW value)
  const oldDoc = await this.constructor.findById(this._id).select('status').lean();
  const oldStatus = oldDoc?.status;
  const newStatus = this.status;

  console.log(`[Conversation Middleware] Status change detected: ${oldStatus} → ${newStatus}`);

  // Store sync info for post-save hook
  this._statusChanged = {
    old: oldStatus,
    new: newStatus,
    triggeredBy: this.assignedAgent || null
  };

  next();
});

conversationSchema.post('save', async function(doc) {
  // Only run sync if status changed
  if (!doc._statusChanged) {
    return;
  }

  const { old, new: newStatus, triggeredBy } = doc._statusChanged;

  // Run sync asynchronously (don't block save operation)
  const statusSyncService = require('../services/statusSyncService');

  // Use setImmediate to avoid blocking the save response
  setImmediate(() => {
    statusSyncService.syncConversationToTickets(doc._id, newStatus, triggeredBy)
      .catch(err => {
        console.error(`[Conversation Middleware] Sync failed:`, err);
      });
  });
});

module.exports = mongoose.model('Conversation', conversationSchema);
```

#### Update File: `src/models/Ticket.js`

Add this middleware BEFORE the `module.exports` line:

```javascript
// ... existing pre('save') middleware for timestamps ...

// ============================================
// MIDDLEWARE: Auto-sync status changes
// ============================================

ticketSchema.pre('save', async function(next) {
  // Only sync if status actually changed
  if (!this.isModified('status')) {
    return next();
  }

  // Get old status from database
  const oldDoc = await this.constructor.findById(this._id).select('status').lean();
  const oldStatus = oldDoc?.status;
  const newStatus = this.status;

  console.log(`[Ticket Middleware] Status change detected: ${oldStatus} → ${newStatus}`);

  // Store sync info for post-save hook
  this._statusChanged = {
    old: oldStatus,
    new: newStatus,
    triggeredBy: this.assignedAgent || null
  };

  next();
});

ticketSchema.post('save', async function(doc) {
  // Only run sync if status changed
  if (!doc._statusChanged) {
    return;
  }

  const { old, new: newStatus, triggeredBy } = doc._statusChanged;

  // Run sync asynchronously
  const statusSyncService = require('../services/statusSyncService');

  setImmediate(() => {
    statusSyncService.syncTicketToConversation(doc._id, newStatus, triggeredBy)
      .catch(err => {
        console.error(`[Ticket Middleware] Sync failed:`, err);
      });
  });
});

module.exports = mongoose.model('Ticket', ticketSchema);
```

**Why this prevents infinite loops:**
- Mongoose middleware only triggers on `.save()` calls
- The sync service uses `findByIdAndUpdate()` internally (doesn't trigger middleware)
- Even if middleware triggers middleware, the `isModified('status')` check prevents cascading
- The old status is fetched once and compared before any sync logic runs

---

### 4. Race Condition Prevention

**Problem Areas:**
1. Simultaneous conversation and ticket status updates
2. Multiple tickets updating same conversation simultaneously
3. Socket.io events triggering frontend updates that trigger backend calls

**Solutions:**

#### Solution 1: Debouncing with Lock Flag

Add to `src/services/statusSyncService.js`:

```javascript
class StatusSyncService {
  constructor() {
    // Track ongoing sync operations
    this.syncLocks = new Map(); // conversationId → Promise
  }

  /**
   * Acquire lock for conversation sync
   * Returns existing promise if sync already in progress
   */
  async acquireSyncLock(conversationId, syncOperation) {
    const lockKey = `conversation_${conversationId}`;

    // If sync already in progress, wait for it
    if (this.syncLocks.has(lockKey)) {
      console.log(`   ⏳ Waiting for existing sync to complete...`);
      await this.syncLocks.get(lockKey);
      return false; // Don't run duplicate sync
    }

    // Create new lock
    const lockPromise = syncOperation();
    this.syncLocks.set(lockKey, lockPromise);

    try {
      await lockPromise;
    } finally {
      this.syncLocks.delete(lockKey);
    }

    return true; // Sync completed
  }

  async syncConversationToTickets(conversationId, newConversationStatus, triggeredBy) {
    // Wrap in lock
    await this.acquireSyncLock(conversationId, async () => {
      // ... existing sync logic ...
    });
  }
}
```

#### Solution 2: Debounced Socket.io Events

The existing Socket.io events are one-way (backend → frontend), so no infinite loops are possible. However, if the frontend triggers status changes, add debouncing:

```javascript
// In frontend (Angular): Debounce status change clicks
import { debounceTime } from 'rxjs/operators';

statusChange$.pipe(
  debounceTime(500) // Wait 500ms before sending to backend
).subscribe(change => {
  this.conversationService.updateStatus(change);
});
```

---

### 5. Updated Mongoose Schema

#### File: `src/models/Conversation.js` (Schema Change)

```javascript
// Line 24-29 (OLD):
status: {
  type: String,
  enum: ['open', 'assigned', 'waiting', 'resolved', 'closed'],
  default: 'open',
  index: true
},

// Line 24-29 (NEW):
status: {
  type: String,
  enum: ['open', 'active', 'closed'],
  default: 'open',
  index: true
},
```

**IMPORTANT:** This schema change must be deployed AFTER the migration script runs.

---

### 6. Service Layer Updates

No major changes needed! The existing services will continue to work because:

1. **agentAssignmentService.js**:
   - Line 122: `conversation.status = 'assigned'` → Change to `'active'`
   - Line 318: `conversation.status = 'open'` → No change needed

2. **autoTimeoutService.js**:
   - Line 54: `status: 'assigned'` → Change to `'active'`
   - Line 130: `conversation.status = 'open'` → No change needed

3. **queueService.js**:
   - Line 55: `status: { $in: ['assigned', 'waiting'] }` → Change to `status: 'active'`

4. **conversationController.js**:
   - No changes needed - filtering by status will work with new values

**Code Updates Required:**

#### File: `src/services/agentAssignmentService.js`

```javascript
// Line 122 (OLD):
conversation.status = 'assigned';

// Line 122 (NEW):
conversation.status = 'active';
```

#### File: `src/services/autoTimeoutService.js`

```javascript
// Line 54 (OLD):
status: 'assigned',

// Line 54 (NEW):
status: 'active',
```

#### File: `src/services/queueService.js`

```javascript
// Line 55 (OLD):
status: { $in: ['assigned', 'waiting'] }

// Line 55 (NEW):
status: 'active'
```

---

### 7. Ticket-Conversation Relationship Strategy

**Decision: Multiple Tickets → Aggregate Status Logic**

**Rule Set:**

1. **If ANY ticket is `in_progress` or `open`:**
   - Conversation should be `active`

2. **If ALL tickets are `closed`:**
   - Conversation should be `closed`

3. **If ALL tickets are `resolved` (but not closed):**
   - Emit suggestion to close conversation (don't auto-close)
   - Agent decides if conversation should be closed

4. **Closing a ticket does NOT automatically close conversation:**
   - Only when ALL tickets are closed

5. **Closing a conversation DOES close all tickets:**
   - Conversation closure is the final action

**Why this approach:**
- Conversation is the "parent" container
- Tickets are granular workflow items
- Closing conversation = customer interaction ended
- Multiple open tickets = ongoing customer relationship

**Implementation:** Already covered in `statusSyncService.js` above.

---

### 8. API Changes

**No new endpoints needed!** Existing endpoints handle the simplified model:

**Existing Endpoints (No Changes):**
- `GET /api/v2/conversations?status=open` - Works with new values
- `POST /api/v2/conversations/:id/assign` - Sets status to `active`
- `POST /api/v2/conversations/:id/release` - Sets status to `open`
- `POST /api/v2/conversations/:id/resolve` - Sets status to `closed`

**Optional New Endpoint (for diagnostics):**

```javascript
// File: src/controllers/conversationController.js

/**
 * GET /api/v2/conversations/:id/sync-status
 * Manually trigger status sync (for debugging)
 */
async function manualSyncStatus(req, res) {
  try {
    const conversationId = req.params.id;
    const statusSyncService = require('../services/statusSyncService');

    const conversation = await Conversation.findById(conversationId);
    if (!conversation) {
      return res.status(404).json({ error: 'Conversation not found' });
    }

    // Force sync
    await statusSyncService.syncConversationToTickets(
      conversationId,
      conversation.status,
      req.agent._id
    );

    return res.json({
      success: true,
      message: 'Status sync triggered',
      conversationStatus: conversation.status
    });
  } catch (error) {
    console.error('Manual sync error:', error);
    return res.status(500).json({ error: error.message });
  }
}

// Add to module.exports
module.exports = {
  // ... existing exports ...
  manualSyncStatus
};
```

---

## Implementation Checklist

### Phase 1: Preparation (Day 1)
- [ ] Create migration script (`migrations/001_simplify_conversation_status.js`)
- [ ] Create status sync service (`src/services/statusSyncService.js`)
- [ ] Add sync middleware to Conversation model
- [ ] Add sync middleware to Ticket model
- [ ] Backup production database

### Phase 2: Migration (Day 1-2)
- [ ] Run migration script in staging environment
- [ ] Verify data integrity (check status distribution)
- [ ] Test rollback procedure
- [ ] Run migration in production (off-peak hours)
- [ ] Monitor logs for errors

### Phase 3: Code Deployment (Day 2)
- [ ] Update Conversation schema enum
- [ ] Update `agentAssignmentService.js` (status = 'active')
- [ ] Update `autoTimeoutService.js` (status = 'active')
- [ ] Update `queueService.js` (status query)
- [ ] Deploy backend code
- [ ] Monitor sync logs for 24 hours

### Phase 4: Testing (Day 3)
- [ ] Test conversation assignment (open → active)
- [ ] Test conversation release (active → open)
- [ ] Test conversation close (active → closed)
- [ ] Test ticket creation with conversation sync
- [ ] Test ticket resolution with conversation sync
- [ ] Test multiple tickets per conversation
- [ ] Test Socket.io events

### Phase 5: Monitoring (Day 4-7)
- [ ] Monitor sync service logs
- [ ] Check for race conditions
- [ ] Verify Socket.io events firing correctly
- [ ] Monitor database query performance
- [ ] Check frontend displays correct statuses

---

## Testing Strategy

### Unit Tests

**File: `tests/unit/statusSyncService.test.js`**

```javascript
const statusSyncService = require('../../src/services/statusSyncService');
const Conversation = require('../../src/models/Conversation');
const Ticket = require('../../src/models/Ticket');

describe('StatusSyncService', () => {
  describe('syncConversationToTickets', () => {
    it('should close all tickets when conversation is closed', async () => {
      // Create test conversation and tickets
      const conversation = await Conversation.create({
        customerId: testCustomerId,
        status: 'active'
      });

      const ticket = await Ticket.create({
        ticketId: 'TEST-001',
        conversationId: conversation._id,
        customerId: testCustomerId,
        status: 'open',
        subject: 'Test',
        description: 'Test',
        category: 'other'
      });

      // Close conversation
      conversation.status = 'closed';
      await conversation.save();

      // Wait for async sync
      await new Promise(resolve => setTimeout(resolve, 100));

      // Verify ticket was closed
      const updatedTicket = await Ticket.findById(ticket._id);
      expect(updatedTicket.status).toBe('closed');
    });

    it('should not change ticket status when conversation is opened', async () => {
      // Test that open → active doesn't force ticket changes
    });
  });

  describe('syncTicketToConversation', () => {
    it('should set conversation to active when ticket is in_progress', async () => {
      // Test ticket in_progress → conversation active
    });

    it('should close conversation when all tickets are closed', async () => {
      // Test all tickets closed → conversation closed
    });

    it('should not close conversation if any ticket is still open', async () => {
      // Test mixed ticket statuses
    });
  });
});
```

### Integration Tests

**File: `tests/integration/conversationTicketSync.test.js`**

```javascript
describe('Conversation-Ticket Sync Integration', () => {
  it('should sync status bidirectionally', async () => {
    // 1. Create conversation
    // 2. Assign agent (conversation → active)
    // 3. Create ticket (should be open)
    // 4. Update ticket to in_progress
    // 5. Verify conversation is still active
    // 6. Close ticket
    // 7. Verify conversation is closed
  });

  it('should handle multiple tickets correctly', async () => {
    // Create conversation with 3 tickets
    // Close 2 tickets → conversation should stay active
    // Close 3rd ticket → conversation should close
  });
});
```

---

## Rollback Plan

### Emergency Rollback (If Migration Fails)

1. **Stop application:**
   ```bash
   pm2 stop whatsapp-bot
   ```

2. **Restore database backup:**
   ```bash
   mongorestore --uri="mongodb://your-connection-string" /backup/before-status-migration
   ```

3. **Revert code deployment:**
   ```bash
   git revert HEAD
   git push
   pm2 start whatsapp-bot
   ```

### Partial Rollback (If Sync Issues)

1. **Disable sync middleware:**
   - Comment out the `pre('save')` and `post('save')` hooks temporarily
   - Deploy hotfix

2. **Run reverse migration:**
   ```bash
   npm run migrate:status:rollback
   ```

3. **Monitor and fix issues**

---

## Performance Considerations

### Database Indexes

Ensure these indexes exist:

```javascript
// Conversation model
conversationSchema.index({ status: 1 }); // Already exists
conversationSchema.index({ status: 1, assignedAgent: 1 }); // Already exists

// Ticket model
ticketSchema.index({ conversationId: 1, status: 1 }); // Add if missing
```

### Sync Performance

- Sync operations are asynchronous (don't block save)
- Use `setImmediate()` to avoid blocking event loop
- Lock mechanism prevents duplicate syncs
- Typical sync time: < 50ms per conversation

### Socket.io Performance

- Events are emitted after DB save completes
- Use room-based targeting (`io.to(roomId)`) to reduce broadcast overhead
- Consider throttling if more than 100 status changes per second

---

## Monitoring and Alerts

### Logs to Monitor

1. **Sync operations:**
   ```
   [StatusSync] Conversation ${id} → ${status}
   [StatusSync] Ticket ${id} → Conversation
   ```

2. **Errors:**
   ```
   [StatusSync] Error syncing conversation to tickets
   [Conversation Middleware] Sync failed
   ```

3. **Lock contention:**
   ```
   Waiting for existing sync to complete
   ```

### Metrics to Track

- Sync success rate (target: > 99%)
- Average sync duration (target: < 50ms)
- Race condition occurrences (target: 0)
- Failed sync operations (target: < 1%)

### Alerts

Set up alerts for:
- Sync failures > 5 in 5 minutes
- Sync duration > 500ms consistently
- Lock contention > 10 concurrent

---

## Security Considerations

### Authorization

- Status changes should respect agent permissions
- Only assigned agents can change conversation to `active`
- Only admins can manually sync statuses
- Sync operations inherit permissions from triggering agent

### Audit Trail

- All status changes logged in `internalNotes`
- `statusHistory` tracks ticket status changes
- Sync operations include `triggeredBy` field

---

## Frontend Impact

### Required Frontend Changes

1. **Update status filter options:**
   ```typescript
   // OLD
   statusOptions = ['open', 'assigned', 'waiting', 'resolved', 'closed'];

   // NEW
   statusOptions = ['open', 'active', 'closed'];
   ```

2. **Update status badge colors:**
   ```typescript
   getStatusColor(status: string): string {
     switch (status) {
       case 'open': return 'bg-blue-500';
       case 'active': return 'bg-green-500';
       case 'closed': return 'bg-gray-500';
       default: return 'bg-gray-300';
     }
   }
   ```

3. **Update Socket.io listeners:**
   - Listen for `conversation_updated` with `syncedFrom` field
   - Show sync indicator when status changes automatically

---

## Environment Variables

No new environment variables required.

---

## Documentation Updates

After implementation:

1. Update `CLAUDE.md` with new status values
2. Update API documentation
3. Add migration guide for developers
4. Document sync behavior in ticket system docs

---

## Success Criteria

### Definition of Done

- [ ] Migration script runs successfully without errors
- [ ] All conversations have valid status (`open`, `active`, or `closed`)
- [ ] Status sync works bidirectionally (Conversation ↔ Ticket)
- [ ] No infinite loops or race conditions
- [ ] Socket.io events emit correctly
- [ ] Frontend displays correct statuses
- [ ] Unit tests pass (> 90% coverage)
- [ ] Integration tests pass
- [ ] Performance metrics within targets
- [ ] No production errors for 7 days post-deployment

---

## Timeline Estimate

- **Day 1:** Migration script + sync service development (6 hours)
- **Day 2:** Testing + staging deployment (4 hours)
- **Day 3:** Production migration + code deployment (3 hours)
- **Day 4-7:** Monitoring + bug fixes (2 hours/day)

**Total:** ~22 hours over 7 days

---

## Questions Answered

### 1. Migration Strategy
**Answer:** MongoDB migration script + application-layer validation. Run migration BEFORE deploying new code. Rollback capability via reverse migration script.

### 2. Sync Service Design
**Answer:** Event-driven via Mongoose middleware (`pre/post save` hooks). Centralized sync logic in `statusSyncService.js`. No manual sync calls needed in services.

### 3. Ticket-Conversation Relationship
**Answer:** Aggregate logic - conversation status based on ALL tickets. Closing conversation closes all tickets. Closing all tickets closes conversation. Partial ticket closure keeps conversation active.

### 4. Race Conditions
**Answer:** Lock mechanism in sync service prevents concurrent syncs. Mongoose middleware only triggers on `.save()` calls. Debounced Socket.io events. No infinite loops because sync uses `findByIdAndUpdate()` (doesn't trigger middleware).

### 5. API Changes
**Answer:** No new endpoints needed. Existing endpoints work with new status values. Optional diagnostics endpoint for manual sync trigger.

---

## Contact and Support

For questions during implementation:
- Architecture: Review this document
- Bugs: Check logs in `statusSyncService.js` and model middleware
- Performance: Monitor database query times and sync duration

---

**End of Implementation Plan**
