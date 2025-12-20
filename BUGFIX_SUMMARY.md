# Bug Fix Summary - WhatsApp Notifications & Health Endpoint

## Issues Found from Production Logs

### Issue 1: Missing `getActiveUsersCount` Function ✅ FIXED
**Error:** `TypeError: openaiService.getActiveUsersCount is not a function`

**Location:** `/info` endpoint in `healthController.js:130`

**Root Cause:** The function was called but never implemented in `openaiService.js`

**Fix Applied:**
- Added `getActiveUsersCount()` function to `src/services/openaiService.js` (lines 547-556)
- Function queries UserThread model to count active threads
- Exported the function in module.exports (line 558)

**Files Modified:**
- `src/services/openaiService.js`

---

### Issue 2: Agent Missing Phone Number ⚠️ NEEDS ACTION
**Warning:** `⚠️ Agent admin@luxfree.com does not have a phone number configured. Skipping WhatsApp notification.`

**Root Cause:**
1. Agent phone numbers are required for WhatsApp notifications
2. The admin agent was created before phone number requirement was added
3. Phone numbers were not automatically formatted when stored

**Fixes Applied:**
1. **Prevention (Future):** Modified `agentController.js` to auto-format phone numbers on create/update:
   - `createAgent()` - lines 187-192
   - `updateProfile()` - lines 100-108
   - `updateAgent()` - lines 261-269

2. **Helper Script:** Created `scripts/updateAgentPhone.js` for quick phone updates

**Files Modified:**
- `src/controllers/agentController.js`
- `scripts/updateAgentPhone.js` (new)

---

## Deployment Steps

### 1. Deploy Code Changes
```bash
# On your server
cd /var/www/whatsapp-meta-bot-nodejs
git pull origin main
pm2 restart whatsapp-bot
```

### 2. Fix Admin Agent Phone Number
```bash
# On your server
cd /var/www/whatsapp-meta-bot-nodejs
node scripts/updateAgentPhone.js admin@luxfree.com 5219991234567
# Replace 5219991234567 with the actual admin's WhatsApp number
```

### 3. Verify All Agents Have Phone Numbers
```bash
# Check all agents
node scripts/migrateAgentPhoneNumbers.js --check
```

### 4. Update Missing Phone Numbers (if any)
```bash
# Interactive mode - prompts for each agent
node scripts/migrateAgentPhoneNumbers.js --interactive
```

---

## Phone Number Format Guidelines

### ✅ Correct Formats
- **13 digits (auto-formatted):** `5219991234567` → stored as `529991234567`
- **12 digits (already formatted):** `529991234567` → stored as-is

### ❌ Avoid These Formats
- 10 digits only: `9991234567` (missing country code)
- With formatting: `+52 999 123 4567` (will be cleaned automatically)
- Wrong country code: `1234567890` (not valid for Mexico)

### Best Practice
Always enter phone numbers in **13-digit format** (country code + 1 + 10 digits):
- Mexico: `5219991234567`
- System will auto-format to 12 digits: `529991234567`

---

## Testing the Fixes

### Test 1: Health Endpoint
```bash
curl http://your-server/info
# Should return service info without errors
```

### Test 2: WhatsApp Notification
1. Assign a conversation to an agent with phone number
2. Check agent receives WhatsApp notification
3. Verify notification goes to AGENT, not customer

### Test 3: Check Logs
```bash
pm2 logs whatsapp-bot --lines 50
# Should NOT see "getActiveUsersCount is not a function" error
# Should NOT see "does not have a phone number configured" for active agents
```

---

## Related Documentation
- `docs/PHONE_NUMBER_MIGRATION.md` - Detailed migration guide
- `docs/PHONE_NUMBER_REQUIREMENT_SUMMARY.md` - Phone number requirement details
- `scripts/migrateAgentPhoneNumbers.js` - Batch migration script
- `scripts/updateAgentPhone.js` - Single agent update script

---

## Rollback Plan (if needed)

If issues occur after deployment:

```bash
# Revert to previous version
cd /var/www/whatsapp-meta-bot-nodejs
git revert HEAD
pm2 restart whatsapp-bot
```

The phone number formatting changes are backward compatible - they only affect NEW/UPDATED agents, not existing ones.
