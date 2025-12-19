# Phone Number Migration Guide

## Overview

As of this update, **phone numbers are now required** for all agents. This is necessary to send WhatsApp notifications when conversations are assigned.

## For Existing Agents

If you have agents already created without phone numbers, you have three options:

### Option 1: Interactive Migration (Recommended)

This mode prompts you to enter each agent's real phone number:

```bash
node scripts/migrateAgentPhoneNumbers.js --interactive
```

**Benefits:**
- ✅ Sets real phone numbers for each agent
- ✅ Agents will receive WhatsApp notifications immediately
- ✅ Full control over each agent's number

**Example:**
```
👤 John Doe (john@example.com)
   Enter phone number (or "skip"): 529991234567
   ✅ Updated with phone number: 529991234567
```

### Option 2: Placeholder Mode (Quick Fix)

Sets temporary placeholder numbers for all agents:

```bash
node scripts/migrateAgentPhoneNumbers.js --placeholder
```

**Benefits:**
- ⚡ Quick migration for all agents
- ✅ Satisfies the required field constraint
- ⚠️ Agents will NOT receive WhatsApp notifications until they update with real numbers

**Placeholder Format:** `52999000000X` (where X is unique per agent)

**Important:** After using this option, agents should update their phone numbers via:
- Profile → Settings in the web UI
- Or admin can update via agent management

### Option 3: Check Only

Check which agents are missing phone numbers without making changes:

```bash
node scripts/migrateAgentPhoneNumbers.js --check
```

## For New Agents

When creating new agents via the web UI or API:

1. **Web UI:** Phone number field is now **required** (marked with *)
2. **API:** Must include `phoneNumber` in the request body

### API Example:

```javascript
POST /api/v2/agents
{
  "email": "agent@example.com",
  "password": "securepassword",
  "firstName": "Jane",
  "lastName": "Smith",
  "phoneNumber": "529991234567",  // REQUIRED
  "role": "agent"
}
```

## Phone Number Format

- **Format:** Country code + number (no spaces, dashes, or special characters)
- **Length:** 10-15 digits
- **Examples:**
  - Mexico: `529991234567` (52 + 10 digits)
  - USA: `15551234567` (1 + 10 digits)
  - Spain: `34612345678` (34 + 9 digits)

## Updating Agent Phone Numbers

### Via Web UI
1. Navigate to **Agents** section
2. Click **Edit** on the agent
3. Update **Phone Number** field
4. Click **Save**

### Via API
```javascript
PATCH /api/v2/agents/:agentId
{
  "phoneNumber": "529991234567"
}
```

### Via Profile (Self-Service)
1. Click profile icon in top right
2. Go to **Settings**
3. Update **Phone Number**
4. Click **Save**

## Troubleshooting

### Agent not receiving notifications?

1. **Check phone number format:**
   ```bash
   node scripts/migrateAgentPhoneNumbers.js --check
   ```

2. **Verify phone number is correct:**
   - Should start with country code
   - No spaces, dashes, or special characters
   - Between 10-15 digits

3. **Check agent settings:**
   - Notifications must be enabled
   - Agent must have `autoAssign: true` to receive assignment notifications

### Migration script errors?

**Error: "MONGODB is not defined"**
- Ensure `.env` file has `MONGODB` connection string

**Error: "Agent already exists"**
- This is expected when trying to create duplicate agents
- Use update endpoint instead

## Technical Details

### Database Schema Change

```javascript
phoneNumber: {
    type: String,
    required: [true, 'Phone number is required for WhatsApp notifications'],
    trim: true
}
```

### Backend Validation

- **Create Agent:** Returns 400 if phoneNumber is missing
- **Update Agent:** Accepts phoneNumber in update payload
- **Notification Service:** Validates phone number before sending WhatsApp messages

### Frontend Validation

- **Required field** validation
- **Format validation** (10-15 digits)
- **Helpful error messages**
- **Placeholder example** in input field

## Migration Checklist

- [ ] Run migration script (interactive or placeholder mode)
- [ ] Verify all agents have phone numbers
- [ ] Test WhatsApp notifications with one agent
- [ ] Update any placeholder numbers with real numbers
- [ ] Inform agents to verify their phone numbers
- [ ] Update deployment documentation

## Questions?

For issues or questions about this migration, please contact the development team or create an issue in the repository.
