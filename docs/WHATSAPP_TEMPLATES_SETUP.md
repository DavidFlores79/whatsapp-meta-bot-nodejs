# WhatsApp Message Templates Setup Guide

This guide explains how to create and configure WhatsApp message templates in Meta Business Manager for ticket resolution notifications.

## Overview

WhatsApp requires pre-approved message templates to send notifications to customers outside the 24-hour messaging window. This is essential for ticket resolution notifications.

## Template Types

### 1. Ticket Resolved (Spanish) - UTILITY

**Template Name:** `ticket_resolved_es`
**Category:** UTILITY
**Language:** Spanish (es)

#### Configuration in Meta Business Manager:

1. Go to [Meta Business Manager](https://business.facebook.com/)
2. Navigate to **WhatsApp Manager** → **Message Templates**
3. Click **Create Template**
4. Fill in the following:

**Header:** None

**Body:**
```
✅ *Ticket Resuelto*

Hola {{1}},

Tu ticket *{{2}}* ha sido marcado como resuelto.

📋 *Resumen de la solución:*
{{3}}

*Resuelto por:* {{4}}
*Fecha:* {{5}}

¿Tu problema está completamente resuelto?

Si aún tienes algún inconveniente o necesitas ayuda adicional, puedes responder a este mensaje y tu ticket será reabierto automáticamente.

Gracias por tu paciencia.
- Equipo {{6}}
```

**Footer:** None

**Buttons:** None (UTILITY templates don't support buttons)

**Variables:**
- `{{1}}` - Customer first name (e.g., "Juan")
- `{{2}}` - Ticket ID (e.g., "LUX-2025-000003")
- `{{3}}` - Resolution summary from agent (e.g., "Se reemplazó el panel solar defectuoso")
- `{{4}}` - Agent name (e.g., "David Admin")
- `{{5}}` - Resolution date (e.g., "28/12/2024 18:30")
- `{{6}}` - Company name (e.g., "LUXFREE")

---

### 2. Ticket Resolved (English) - UTILITY

**Template Name:** `ticket_resolved_en`
**Category:** UTILITY
**Language:** English (en)

#### Configuration in Meta Business Manager:

**Header:** None

**Body:**
```
✅ *Ticket Resolved*

Hello {{1}},

Your ticket *{{2}}* has been marked as resolved.

📋 *Solution summary:*
{{3}}

*Resolved by:* {{4}}
*Date:* {{5}}

Is your issue completely resolved?

If you still have any problems or need additional help, you can reply to this message and your ticket will be automatically reopened.

Thank you for your patience.
- {{6}} Team
```

**Footer:** None

**Buttons:** None

**Variables:**
- `{{1}}` - Customer first name
- `{{2}}` - Ticket ID
- `{{3}}` - Resolution summary
- `{{4}}` - Agent name
- `{{5}}` - Resolution date
- `{{6}}` - Company name

---

### 3. Interactive Ticket Resolved (Spanish) - MARKETING

**Template Name:** `ticket_resolved_interactive_es`
**Category:** MARKETING
**Language:** Spanish (es)

**Note:** This template allows Quick Reply buttons but requires MARKETING category and may have sending limits based on your WhatsApp Business tier.

**Header:** None

**Body:**
```
✅ *Ticket Resuelto*

Hola {{1}},

Tu ticket *{{2}}* ha sido marcado como resuelto.

📋 *Resumen de la solución:*
{{3}}

*Resuelto por:* {{4}}
*Fecha:* {{5}}

¿Cómo te sientes con la solución?
```

**Footer:** None

**Buttons (Quick Replies):**
1. "✅ Todo resuelto"
2. "❌ Aún tengo problemas"
3. "📞 Hablar con agente"

**Variables:** Same as above (1-6)

---

### 4. Interactive Ticket Resolved (English) - MARKETING

**Template Name:** `ticket_resolved_interactive_en`
**Category:** MARKETING
**Language:** English (en)

**Note:** This template allows Quick Reply buttons but requires MARKETING category and may have sending limits based on your WhatsApp Business tier.

**Header:** None

**Body:**
```
✅ *Ticket Resolved*

Hello {{1}},

Your ticket *{{2}}* has been marked as resolved.

📋 *Solution summary:*
{{3}}

*Resolved by:* {{4}}
*Date:* {{5}}

How do you feel about the solution?
```

**Footer:** None

**Buttons (Quick Replies):**
1. "✅ All resolved"
2. "❌ Still have issues"
3. "📞 Talk to agent"

**Variables:** Same as above (1-6)

---

## Template Approval Process

1. **Submit Template:** After creating the template, click "Submit"
2. **Review Time:** Meta typically reviews templates within 24 hours
3. **Status Check:** Monitor template status in WhatsApp Manager
4. **Approval:** Once approved, status will change to "APPROVED"
5. **Usage:** Only APPROVED templates can be sent via API

## Environment Variables Setup

After templates are approved, add them to your `.env` file:

```env
# WhatsApp Message Templates
WHATSAPP_TEMPLATE_TICKET_RESOLVED_ES=ticket_resolved_es
WHATSAPP_TEMPLATE_TICKET_RESOLVED_EN=ticket_resolved_en
WHATSAPP_TEMPLATE_TICKET_RESOLVED_INTERACTIVE_ES=ticket_resolved_interactive_es
WHATSAPP_TEMPLATE_TICKET_RESOLVED_INTERACTIVE_EN=ticket_resolved_interactive_en
```

## Template Usage Example

```javascript
const whatsappService = require('./services/whatsappService');

// Send ticket resolved notification
await whatsappService.sendTemplateMessage({
  to: '529991234567',
  templateName: 'ticket_resolved_es',
  language: 'es',
  components: [
    {
      type: 'body',
      parameters: [
        { type: 'text', text: 'Juan' },              // {{1}} Customer name
        { type: 'text', text: 'LUX-2025-000003' },   // {{2}} Ticket ID
        { type: 'text', text: 'Panel solar reemplazado' }, // {{3}} Summary
        { type: 'text', text: 'David Admin' },       // {{4}} Agent name
        { type: 'text', text: '28/12/2024 18:30' },  // {{5}} Date
        { type: 'text', text: 'LUXFREE' }            // {{6}} Company
      ]
    }
  ]
});
```

## Best Practices

1. **Template Quality:**
   - Use clear, concise language
   - Include all necessary information
   - Make sure variables are properly formatted

2. **Personalization:**
   - Always use customer's first name
   - Include specific ticket details
   - Reference the actual resolution

3. **Timing:**
   - Send notification immediately when ticket is resolved
   - Don't delay - customers expect quick updates

4. **Follow-up:**
   - Monitor customer responses
   - Auto-reopen tickets if customer replies with issues
   - Track satisfaction metrics

5. **Template Maintenance:**
   - Review template performance monthly
   - Update based on customer feedback
   - Keep language consistent with brand voice

## Troubleshooting

### Template Rejected

Common rejection reasons:
- Variable placeholders not properly formatted
- Misleading or promotional language in UTILITY templates
- Missing required information
- Violates WhatsApp Business Policy

**Solution:** Review Meta's template guidelines and resubmit with corrections

### Template Not Sending

Check:
- Template status is "APPROVED"
- Template name matches exactly (case-sensitive)
- Variables count matches template definition
- Phone number format is correct (12-digit for Mexico)
- Business account has sufficient messaging tier

### Variables Not Replacing

Ensure:
- Parameter order matches template definition
- Parameter type is "text" for all variables
- No empty or null values
- Special characters are properly escaped

## Related Documentation

- [WhatsApp Business API Documentation](https://developers.facebook.com/docs/whatsapp/business-management-api/message-templates)
- [Template Components Reference](https://developers.facebook.com/docs/whatsapp/business-management-api/message-templates/components)
- [WhatsApp Business Policy](https://www.whatsapp.com/legal/business-policy)

## Next Steps

After templates are approved:
1. Implement ticket resolution notification system (see `TICKET_RESOLUTION_NOTIFICATION.md`)
2. Test with real customer tickets
3. Monitor delivery rates and customer responses
4. Adjust templates based on feedback
