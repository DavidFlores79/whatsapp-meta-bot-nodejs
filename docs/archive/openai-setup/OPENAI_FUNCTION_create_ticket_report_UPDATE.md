# create_ticket_report - Location Support Update

## Issue
Location data was NOT being saved when tickets were created via AI, even though the backend fully supports it.

## Root Cause
OpenAI Assistant function definition was missing the `location` parameter.

## Solution
Update the function definition in OpenAI Platform with `docs/OPENAI_FUNCTION_create_ticket_report.json`

## Steps

1. Go to https://platform.openai.com/assistants
2. Select your assistant (ID from `.env`)
3. Edit `create_ticket_report` function
4. Copy content from `docs/OPENAI_FUNCTION_create_ticket_report.json`
5. Paste and save

## What Changed

Added `location` parameter to function:

```json
{
  "location": {
    "type": "object",
    "description": "Service location information. Include if customer shared GPS or mentioned address.",
    "properties": {
      "latitude": { "type": "number" },
      "longitude": { "type": "number" },
      "address": { "type": "string" },
      "formattedAddress": { "type": "string" },
      "isServiceLocation": { "type": "boolean" }
    },
    "required": []
  }
}
```

## Testing

```
1. Send GPS location via WhatsApp
2. Send: "La luz del poste no funciona"
3. Check logs: 📝 create_ticket_report - Raw arguments received: { ... "location": {...} }
4. Verify DB: db.tickets.findOne({ ticketId: "LUX-2025-XXXXX" })
   Should have location.latitude and location.longitude
```

## Backend Already Supports Location ✅

- Message handler saves location (messageHandlers.js:263-269)
- Ticket model has location schema (Ticket.js:92-102)
- ticketService accepts location (ticketService.js:73)
- openaiService extracts location from args (openaiService.js:458)

**No code changes needed - just update OpenAI function definition.**

## Optional but Recommended

Add to your OpenAI Assistant instructions:

```
When creating tickets with create_ticket_report:
- If customer recently sent GPS location, include it in the location parameter
- If customer mentioned an address (e.g., "en Av Tulum 260"), extract it to location.address
- Set isServiceLocation to true for field service tickets
- Don't include location if customer hasn't provided any location info
```

## Backward Compatible

Location is optional - tickets without location still work fine.
