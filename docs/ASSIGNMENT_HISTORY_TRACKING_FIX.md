# Assignment History Tracking Fix

## Issue Summary

Several system-initiated actions that release agents from conversations were **not being tracked** in the `AgentAssignmentHistory` collection. This resulted in incomplete historical data for analytics and auditing purposes.

## Problems Identified

### 1. ✅ FIXED: Auto-Timeout Due to Inactivity
**File:** `src/services/autoTimeoutService.js`

**Issue:** When the system automatically released an agent from a conversation due to 15 minutes of inactivity, this action was NOT recorded in the assignment history.

**Impact:** 
- No record of why the agent was removed
- Missing data for agent performance analytics
- Inability to track patterns of agent inactivity

**Fix Applied:**
- Added `AgentAssignmentHistory` tracking when auto-timeout releases agent
- Records release reason as `'auto_timeout_inactivity'`
- Release method marked as `'system'`
- Tracks number of messages sent by agent during assignment
- Marks `followUpRequired: true` (since agent was inactive)

### 2. ✅ FIXED: Conversation Close (Agent Release)
**File:** `src/services/conversationLifecycleService.js`

**Issue:** When a conversation was closed (either normally or force-closed), and the agent was released, this release was NOT tracked in assignment history.

**Impact:**
- Lost data about how conversations ended
- Incomplete agent performance metrics
- No differentiation between normal close vs forced close

**Fix Applied:**
- Added `AgentAssignmentHistory` tracking when closing conversation releases agent
- Records release reason as `'conversation_closed'`
- Release method marked as `'normal_close'` or `'forced_close'`
- Tracks if issue was resolved (`issueResolved` field)
- Records resolution notes from the close reason

### 3. ⚠️ NOT FIXED: Customer "Not Resolved" Response
**File:** `src/services/conversationLifecycleService.js` (Line ~290)

**Issue:** When a customer responds to resolution confirmation saying the issue is NOT resolved, the conversation is automatically reassigned to an agent, but this action creates NO new assignment history record.

**Impact:**
- No tracking of conversation being returned to agent queue
- Missing data about customer dissatisfaction with initial resolution
- Incomplete reassignment tracking

**Status:** ⚠️ **Requires Design Decision**
- Should this create a new assignment history entry?
- Or should it just update the status without creating new history?
- Currently only increments `conversation.reassignmentCount`

### 4. ✅ TRACKED SEPARATELY: Priority Escalations
**File:** Multiple (priority is tracked in conversation model)

**Status:** ✅ **Already Properly Tracked**
- Priority changes are tracked in `conversation.priorityHistory` array
- Includes reason, timestamp, and trigger information
- Separate from agent assignment history (as it should be)

## What Was Changed

### Files Modified

1. **`src/services/autoTimeoutService.js`**
   - Added imports: `AgentAssignmentHistory`, `Message`
   - Modified `resumeAIForConversation()` function
   - Now tracks assignment history when releasing due to timeout

2. **`src/services/conversationLifecycleService.js`**
   - Added imports: `AgentAssignmentHistory`, `Message`
   - Modified `closeConversation()` function
   - Now tracks assignment history when closing releases agent

## Actions Already Properly Tracked

The following actions **are** properly tracked and do NOT need fixes:

1. ✅ **Manual Assignment** - `assignConversationToAgent()`
2. ✅ **Auto Assignment** - `autoAssignConversation()`
3. ✅ **Manual Release to AI** - `releaseConversation()`
4. ✅ **Transfer Between Agents** - `transferConversation()` (uses release + assign)
5. ✅ **Priority Changes** - Tracked in `conversation.priorityHistory`

## Testing Recommendations

### Test Case 1: Auto-Timeout
1. Assign conversation to agent
2. Wait 15 minutes without agent activity
3. Verify assignment history record created with:
   - `releaseReason: 'auto_timeout_inactivity'`
   - `releaseMethod: 'system'`
   - `releasedAt` timestamp
   - Duration calculated

### Test Case 2: Close Conversation
1. Assign conversation to agent
2. Close conversation (either normal or forced)
3. Verify assignment history record updated with:
   - `releaseReason: 'conversation_closed'`
   - `releaseMethod: 'normal_close'` or `'forced_close'`
   - `finalStatus: 'closed'`
   - Agent message count

### Test Case 3: Customer "Not Resolved"
1. Resolve conversation
2. Customer responds saying not resolved
3. ⚠️ Currently NO new assignment history created
4. Verify `conversation.reassignmentCount` increments

## Database Schema Reference

### AgentAssignmentHistory Fields Used

```javascript
{
  conversationId: ObjectId,
  customerId: ObjectId,
  agentId: ObjectId,
  assignedAt: Date,
  releasedAt: Date,           // Added by fixes
  duration: Number,           // Calculated by fixes
  releaseReason: String,      // Added by fixes
  releaseMethod: String,      // Added by fixes
  finalStatus: String,        // Added by fixes
  agentSummary: {
    messagesSent: Number,     // Added by fixes
    issueResolved: Boolean,   // Added by fixes
    resolutionNotes: String,  // Added by fixes
    followUpRequired: Boolean // Added by fixes
  }
}
```

## Migration Notes

**No database migration required.** The fixes only add data to existing optional fields in the `AgentAssignmentHistory` schema.

Existing assignment history records remain valid and unchanged.

## Future Considerations

### Recommendation: Track Customer "Not Resolved" Response
Consider creating a new assignment history entry when customer says not resolved, to properly track:
- When conversation was returned to agent queue
- Customer dissatisfaction with initial resolution
- Complete reassignment history

This would require:
1. Deciding if this should create a new assignment or just reopen existing one
2. Updating `conversationLifecycleService.js` line ~290
3. Creating appropriate history entry with reason `'customer_not_resolved'`

## Commit Details

**Branch:** Current working branch  
**Files Changed:** 2  
- `src/services/autoTimeoutService.js`
- `src/services/conversationLifecycleService.js`

**Changes:**
- Added assignment history tracking for system-initiated agent releases
- Improved data completeness for analytics and auditing
- No breaking changes to existing functionality
