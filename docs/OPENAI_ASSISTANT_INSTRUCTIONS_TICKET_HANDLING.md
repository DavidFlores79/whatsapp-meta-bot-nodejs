# OpenAI Assistant Instructions - Ticket Creation & Reopening

## CRITICAL: How to Handle Ticket Creation Response

When you call the `create_ticket_report` function, the response includes a `reopened` field that tells you whether a NEW ticket was created or an EXISTING ticket was reopened.

### Response Structure

```json
{
  "success": true,
  "ticketId": "LUX-2025-000006",
  "message": "Message from backend",
  "reopened": true,  // or false
  "reopenCount": 1   // only present if reopened=true
}
```

## Instructions for AI Assistant

**YOU MUST check the `reopened` field and respond accordingly:**

### Case 1: reopened = false (NEW TICKET)
This means a brand new ticket was created. Tell the customer:

```
✅ He creado el reporte *[TICKET_ID]* para tu problema.

📋 **Detalles:**
- **Categoría:** [category in Spanish]
- **Prioridad:** [priority in Spanish]

Un agente de soporte revisará tu caso pronto y te contactará para resolver el problema.

¿Hay algo más que quieras agregar sobre este problema?
```

### Case 2: reopened = true (TICKET REOPENED)
This means an existing ticket was reopened because the customer had a recently resolved ticket. Tell the customer:

```
🔄 He reabierto tu reporte anterior *[TICKET_ID]* ya que detecté que el problema persiste.

📋 **Actualización:**
Tu caso será revisado nuevamente por nuestro equipo técnico. No es necesario crear un reporte nuevo.

[If reopenCount > 1, add:]
⚠️ Nota: Este reporte ha sido reabierto [reopenCount] veces. Un supervisor revisará tu caso con prioridad.

¿Puedes darme más detalles sobre lo que está pasando ahora?
```

## Why This Matters

**BEFORE (Incorrect):**
- Customer has recently resolved ticket LUX-2025-000006
- Problem persists, customer reports again
- AI asks: "¿Confirmas que quiero crear este reporte?" ❌ CONFUSING!
- Backend reopens old ticket automatically
- Customer doesn't understand what happened

**AFTER (Correct):**
- Customer has recently resolved ticket LUX-2025-000006
- Problem persists, customer reports again
- AI explains: "He reabierto tu reporte anterior LUX-2025-000006" ✅ CLEAR!
- Customer understands the old ticket is being used
- No confusion about new vs. reopened tickets

## Updated Assistant Instructions to Add

Add this to your OpenAI Assistant system instructions:

---

### Ticket Creation and Reopening Logic

When creating a support ticket using `create_ticket_report`:

1. **Always check the function response** for the `reopened` field
2. **If `reopened: true`:**
   - Explain to the customer that their PREVIOUS ticket was reopened
   - Use language like: "He reabierto tu reporte anterior" or "Continuaremos con tu caso anterior"
   - Mention the ticket ID and that it's not a new ticket
   - If `reopenCount > 1`, mention this is a recurring issue and emphasize priority

3. **If `reopened: false`:**
   - Explain a NEW ticket was created
   - Welcome them to track it with the ticket ID
   - Explain next steps (agent review, contact, etc.)

4. **Never ask for confirmation after creating/reopening:**
   - The backend has already created or reopened the ticket
   - The function call is the action itself, not a request for permission
   - Just inform the customer what happened

### Example Conversation Flow

**Customer:** "La luz sigue sin funcionar"

**AI detects:** Customer has ticket LUX-2025-000006 resolved 12 hours ago

**AI calls:** `create_ticket_report({ subject: "Luz continúa sin funcionar", ... })`

**Backend returns:**
```json
{
  "success": true,
  "ticketId": "LUX-2025-000006",
  "message": "Tu reporte anterior LUX-2025-000006 ha sido reabierto...",
  "reopened": true,
  "reopenCount": 1
}
```

**AI responds:**
```
🔄 He reabierto tu reporte anterior *LUX-2025-000006* ya que veo que el problema con la luz persiste.

Tu caso será revisado nuevamente por nuestro equipo técnico. No necesitamos crear un reporte nuevo, continuaremos con el anterior.

¿Desde cuándo notaste que la luz dejó de funcionar de nuevo?
```

---

## Implementation Steps

1. **Update OpenAI Assistant Instructions:**
   - Go to: https://platform.openai.com/assistants
   - Select your assistant (use OPENAI_ASSISTANT_ID from .env)
   - Add the instructions above to the "Instructions" section

2. **Test the behavior:**
   - Create and resolve a ticket
   - Report the same issue again within 72 hours
   - Verify AI explains it's reopening the old ticket (not creating new one)

3. **Monitor logs:**
   - Check `reopened` field in function responses
   - Ensure AI is interpreting correctly

## Related Configuration

- Auto-reopen window: 72 hours (configurable in ticket_behavior settings)
- Max reopen count: 3 times (configurable)
- Backend handles detection automatically
- AI must handle communication with customer

---

**Last Updated:** January 2026
