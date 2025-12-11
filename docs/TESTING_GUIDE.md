# Testing Guide - Message Duplication & Location Preview Fixes

## What Was Fixed

### 1. Message Triplication ✅
- **Before**: Messages appeared 3 times in web UI
- **After**: Each message appears exactly once
- **Fix**: Removed duplicate conversation stats updates from controller

### 2. Location Map Preview ✅
- **Before**: Location messages had no map preview image
- **After**: Static Google Maps image shows preview with marker
- **Fix**: Generate `mapImageUrl` using Google Maps Static API

## How to Test

### Test 1: Text Messages (No Duplicates)
1. Open WhatsApp on your phone
2. Send a text message to the bot: "Hello, how are you?"
3. **Expected**: 
   - Message appears **once** in web UI
   - AI responds with single reply
   - Message count increments by 2 (1 customer, 1 AI)

### Test 2: Image Messages (No Duplicates)
1. Send an image to the bot with caption "Check this photo"
2. **Expected**:
   - Image appears **once** in web UI
   - Image shows Cloudinary URL
   - Caption displays correctly
   - Message count increments by 1
   - If agent assigned: no AI response
   - If no agent: AI acknowledges image

### Test 3: Location Messages (With Map Preview)
1. Send a location from WhatsApp
2. **Expected**:
   - Location appears **once** in web UI
   - **Static map image shows** with red marker
   - Address is geocoded and displayed
   - Coordinates shown below address
   - Clicking opens Google Maps in new tab
   - Message count increments by 1
   - If agent assigned: no AI response
   - If no agent: AI acknowledges location

### Test 4: Agent Assignment Flow
1. As customer, send: "I need human help"
2. **Expected**:
   - AI detects escalation keyword
   - Conversation auto-assigned to available agent
   - Agent sees conversation in their list
   - "AI paused" indicator shows
   - Next customer message goes to agent, NOT AI

### Test 5: Message Count Accuracy
1. Start fresh conversation
2. Send: 1 text, 1 image, 1 location
3. **Expected message counts**:
   - Text: 1 customer + 1 AI = **2 messages**
   - Image: **1 message** (no AI if agent assigned)
   - Location: **1 message** (no AI if agent assigned)
   - Total: **4 messages** (or 2 if agent assigned after text)

## What to Look For

### ✅ Success Indicators
- Each message ID appears once in DB
- `messageCount` matches actual number of messages
- `unreadCount` increments correctly
- Location shows static map preview
- No duplicate socket emissions in browser console
- Images load from Cloudinary
- Locations have `mapImageUrl` field populated

### ❌ Failure Indicators
- Same message appears 2-3 times in UI
- Message count higher than actual messages
- Location shows placeholder icon (no map)
- Console errors about undefined fields
- AI responds when agent is assigned

## Database Verification

```bash
# Connect to MongoDB
mongosh "your_mongodb_connection_string"

# Check message counts
use your_database
db.conversations.findOne({ phoneNumber: "YOUR_TEST_NUMBER" })
// Look at messageCount field

# Check for duplicate messages
db.messages.aggregate([
  { $group: { 
    _id: "$whatsappMessageId", 
    count: { $sum: 1 } 
  }},
  { $match: { count: { $gt: 1 } }}
])
// Should return empty array (no duplicates)

# Check location message structure
db.messages.findOne({ 
  type: "location",
  "location.mapImageUrl": { $exists: true }
})
// Should show mapImageUrl field
```

## Frontend Console Checks

Open browser DevTools → Console:

```javascript
// Check socket events (should see each message once)
// Look for: new_message events
// Should NOT see duplicate message IDs

// Check Message structure
// Location messages should have:
{
  type: 'location',
  location: {
    latitude: number,
    longitude: number,
    address: string,
    name: string,
    mapImageUrl: string  // ← Should be present
  }
}
```

## Performance Metrics

### Before Fix
- Messages saved: 3x per customer message
- Socket emissions: 3x per customer message
- DB writes: 3x (message + 2 duplicate stats updates)
- Location preview: iframe (heavy, slow)

### After Fix
- Messages saved: 1x per customer message ✅
- Socket emissions: 1x per customer message ✅
- DB writes: 1x (message + stats update) ✅
- Location preview: static image (light, fast) ✅

## Troubleshooting

### Messages still duplicating?
1. Check `git log` - ensure commits `528398e` and `14e9828` are present
2. Restart Node.js server: `npm run dev`
3. Hard refresh browser: Cmd+Shift+R (Mac) / Ctrl+Shift+R (Windows)
4. Check browser console for old cached JavaScript

### Location map not showing?
1. Verify `GOOGLE_MAPS_API_KEY` in `.env`
2. Check DB: `db.messages.findOne({type: "location"})`
3. Ensure `mapImageUrl` field exists
4. Test static map URL directly in browser
5. Check Google Maps API quota/billing

### Agent assignment not working?
1. Run: `node scripts/checkAgentStatus.js`
2. Verify agent is: `online`, `active`, `autoAssign: true`
3. Check conversation status: `db.conversations.findOne({status: "assigned"})`
4. Monitor logs: `tail -f logs.txt`

## Next Steps After Testing

1. ✅ Verify no duplicates in production
2. ✅ Monitor Google Maps API usage/costs
3. ✅ Test with multiple concurrent users
4. ✅ Verify agent assignment triggers correctly
5. ✅ Check message queue performance
6. Consider adding:
   - Message delivery receipts
   - Read receipts
   - Typing indicators
   - Rich media gallery view
