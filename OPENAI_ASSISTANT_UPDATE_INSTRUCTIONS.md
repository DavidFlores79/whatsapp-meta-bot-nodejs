# OpenAI Assistant Function Update Instructions

## Issue Fixed
The `get_ticket_information` function was not working properly because:
1. Both `ticket_id` and `phone_number` were required parameters
2. When a customer asked about a ticket from a different phone number, the search failed
3. The backend always used the conversation phone number, ignoring the provided phone_number

## Changes Made

### Backend Changes (src/services/openaiService.js)
✅ Updated `get_ticket_information` handler to:
- Accept `phone_number` parameter (optional, falls back to conversation phone)
- Search for ticket by ID first, then verify customer access
- Provide detailed error messages when ticket is not found vs. access denied

### OpenAI Assistant Configuration Required

**IMPORTANT:** You MUST update your OpenAI Assistant function definition in the OpenAI Platform.

1. Go to https://platform.openai.com/assistants
2. Select your assistant (ID: from .env OPENAI_ASSISTANT_ID)
3. Find the `get_ticket_information` function
4. Replace the entire function definition with the content from: `OPENAI_FUNCTION_get_ticket_information.json`

## New Function Definition

Copy this JSON to OpenAI Assistant functions:

```json
{
  "name": "get_ticket_information",
  "description": "Retrieve ticket/report information. Can search by ticket ID, phone number, or get recent tickets for the current customer. Use this when customer asks about ticket status, wants ticket details, or mentions a ticket ID.",
  "strict": true,
  "parameters": {
    "type": "object",
    "properties": {
      "ticket_id": {
        "type": "string",
        "description": "Unique ticket identifier (e.g., 'LUX-2025-000004'). Use this when customer provides a specific ticket ID."
      },
      "phone_number": {
        "type": "string",
        "description": "Phone number of the customer who owns the ticket. Optional - if not provided, uses the current conversation's phone number. Use this when customer mentions a different phone number than they're calling from."
      },
      "lookup_recent": {
        "type": "boolean",
        "description": "Set to true to retrieve recent tickets for the customer instead of a specific ticket. Use when customer asks 'show me my tickets' or 'what tickets do I have'."
      }
    },
    "required": [],
    "additionalProperties": false
  }
}
```

## How It Works Now

### Scenario 1: Customer asks about ticket by ID (same phone)
```
Customer (529991952696): "¿Cuál es el estatus de mi ticket LUX-2025-000004?"
AI calls: get_ticket_information({ ticket_id: "LUX-2025-000004" })
Backend: Uses conversation phone (529991952696) → Returns ticket if customer has access
```

### Scenario 2: Customer asks about ticket by ID (different phone)
```
Customer (529991952696): "Quiero saber del ticket LUX-2025-000004 del número 529991992696"
AI calls: get_ticket_information({ ticket_id: "LUX-2025-000004", phone_number: "529991992696" })
Backend: Uses provided phone (529991992696) → Returns ticket if that customer has access
```

### Scenario 3: Customer asks for recent tickets
```
Customer: "¿Cuáles son mis tickets?"
AI calls: get_ticket_information({ lookup_recent: true })
Backend: Returns last 5 tickets for the conversation's customer
```

## Error Messages

The AI will receive clear error messages:

1. **Ticket not found:**
   ```json
   {
     "success": false,
     "error": "reporte con ID 'LUX-2025-999999' no encontrado."
   }
   ```

2. **Access denied (ticket exists but belongs to another customer):**
   ```json
   {
     "success": false,
     "error": "No tienes acceso al reporte 'LUX-2025-000004'. Este reporte pertenece a otro cliente."
   }
   ```

3. **Customer not found:**
   ```json
   {
     "success": false,
     "error": "No se pudo obtener información del reporte. Cliente no encontrado con el número proporcionado."
   }
   ```

## Testing

After updating the OpenAI Assistant function:

1. Test with ticket ID only:
   - "dame el estatus de LUX-2025-000004"

2. Test with phone number:
   - "quiero saber del ticket del número 529991992696"

3. Test with recent tickets:
   - "muéstrame mis tickets recientes"

4. Test access control:
   - Try to access a ticket that belongs to another customer (should get access denied message)

## Deployment Checklist

- [x] Backend code updated (openaiService.js)
- [x] Function definition JSON created
- [ ] **Update OpenAI Assistant function in platform** ⚠️ REQUIRED
- [ ] Test all scenarios
- [ ] Monitor logs for errors

## Important Notes

- The `required: []` means ALL parameters are optional
- The AI will intelligently choose which parameters to use based on customer request
- Security is maintained: customers can only access their own tickets
- Phone number format must match database (12-digit format: 529991234567)
