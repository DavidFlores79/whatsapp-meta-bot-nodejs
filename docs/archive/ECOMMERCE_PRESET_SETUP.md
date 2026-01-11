# E-commerce Preset Setup Guide

## Quick Fix for Product Search Issue

The AI is refusing product searches because it's using outdated instructions. Here's how to fix it:

## Solution 1: Load E-commerce Preset (Database Update)

The e-commerce preset has been updated with proper product search capabilities. You need to:

### Step 1: Deploy the Updated Code

On your Ubuntu server:

```bash
cd /var/www/whatsapp-meta-bot-nodejs
git pull origin feat/universal-ticket-system
pm2 restart whatsapp
```

### Step 2: Load E-commerce Preset via API

Use the configuration API to load the updated e-commerce preset:

```bash
# Option A: Using curl from server
curl -X POST http://localhost:5000/api/v2/config/presets/load \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_JWT_TOKEN" \
  -d '{"presetId": "ecommerce"}'

# Option B: From your local machine (if server is public)
curl -X POST https://your-domain.com/api/v2/config/presets/load \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_JWT_TOKEN" \
  -d '{"presetId": "ecommerce"}'
```

**Getting JWT Token:**
1. Login to your CRM frontend at https://your-domain.com
2. Open browser DevTools → Application → Local Storage
3. Copy the JWT token value

### Step 3: Get Updated Instructions

After loading the preset, get the generated instructions:

```bash
curl -X GET http://localhost:5000/api/v2/config/assistant \
  -H "Authorization: Bearer YOUR_JWT_TOKEN"
```

This will return the assistant configuration with the `generatedInstructions` field.

### Step 4: Update OpenAI Assistant

1. Go to https://platform.openai.com/assistants
2. Select your assistant (use ID from `.env`)
3. Copy the `generatedInstructions` from Step 3
4. Paste into the "Instructions" field
5. **Ensure these 4 functions are added** (if not already):
   - `search_ecommerce_products`
   - `get_ecommerce_order`
   - `create_ecommerce_order`
   - `get_active_orders`

Function definitions are in: `docs/OPENAI_FUNCTION_*.json`

## Solution 2: Manual Instructions Update (Alternative)

If you prefer to manually update the instructions, here's the key section to add/update:

```
═══════════════════════════════════════════════════════════════════
A) WORKFLOW FOR PRODUCT SEARCH & PURCHASE
═══════════════════════════════════════════════════════════════════

PRODUCT SEARCH:
When customer asks about products, pricing, or availability:
1. Use search_ecommerce_products with their query
2. Show 3-5 most relevant products with:
   - Product name
   - Price (with currency)
   - Stock status
   - Brief description
3. Ask if they want more details or to purchase

ORDER CREATION:
When customer wants to purchase:
1. Confirm product selection and quantities
2. Ask for shipping address (if not on file)
3. Show payment method options
4. Show order summary with total price
5. Ask for confirmation with "CONFIRM" or "CONFIRMAR"
6. Use create_ecommerce_order only after confirmation
7. Provide order ID and estimated delivery time

IMPORTANT FOR SALES:
• ALWAYS be helpful with product searches
• NEVER refuse product inquiries
• Show enthusiasm about products
• Be transparent about pricing and availability
```

## Updated E-commerce Preset Capabilities

The updated preset now includes:

### ✅ Product Search & Browsing
- AI can search products using `search_ecommerce_products()`
- Shows product name, price, stock, description
- NEVER refuses product inquiries

### ✅ Order Creation
- AI can create orders using `create_ecommerce_order()`
- Collects shipping address and payment method
- Provides order confirmation with order ID

### ✅ Order Tracking
- Check order status with `get_ecommerce_order()`
- List active orders with `get_active_orders()`

### ✅ Support Tickets
- Still handles returns, exchanges, refunds
- Creates tickets for problems

## Testing After Setup

Test these scenarios:

1. **Product Search**:
   ```
   User: "¿Qué productos tienen disponibles?"
   Expected: AI searches products and shows list
   ```

2. **Product Details**:
   ```
   User: "¿Cuánto cuesta el producto X?"
   Expected: AI shows price and availability
   ```

3. **Order Creation**:
   ```
   User: "Quiero comprar 2 unidades del producto X"
   Expected: AI asks for address/payment, creates order
   ```

4. **Order Tracking**:
   ```
   User: "¿Dónde está mi pedido ORD-2025-001234?"
   Expected: AI shows order status
   ```

## Before vs After

### BEFORE (Incorrect):
```
User: "¿Qué productos tienen?"
AI: "Lo siento, pero solo puedo ayudar con solicitudes relacionadas
     con problemas, envíos, devoluciones..."
```

### AFTER (Correct):
```
User: "¿Qué productos tienen?"
AI: *calls search_ecommerce_products()*
AI: "¡Claro! Aquí están nuestros productos disponibles:

     1. Panel Solar 100W - $2,500 MXN (En stock)
     2. Batería Litio 12V - $3,800 MXN (En stock)
     3. Inversor 1000W - $4,200 MXN (En stock)

     ¿Te gustaría más información sobre alguno?"
```

## Architecture Notes

- **Backend**: E-commerce functions already implemented in `src/handlers/ecommerceFunctionHandler.js`
- **Database**: Preset stored in SystemSettings with key `configuration_presets`
- **Cache**: Configuration cached for 5 minutes (automatic invalidation on update)
- **Instructions**: Generated dynamically using template + config values

## Troubleshooting

### Issue: AI still refuses product searches after loading preset
**Cause**: OpenAI Assistant instructions not updated on platform
**Solution**: Follow Step 4 above to update instructions on OpenAI platform

### Issue: "Function not found" error
**Cause**: E-commerce functions not added to OpenAI Assistant
**Solution**: Add all 4 functions from `docs/OPENAI_FUNCTION_*.json`

### Issue: E-commerce API connection errors
**Check**:
- `ECOMMERCE_API_URL` in `.env` is correct
- `ECOMMERCE_SERVICE_EMAIL` and `ECOMMERCE_SERVICE_PASSWORD` are valid
- E-commerce API is running and accessible

## Related Files

- Backend configuration: `src/services/configurationService.js` (lines 546-698)
- E-commerce functions: `src/handlers/ecommerceFunctionHandler.js`
- OpenAI integration: `src/services/openaiService.js` (lines 653-661)
- Function definitions: `docs/OPENAI_FUNCTION_search_ecommerce_products.json`, etc.

---

**Last Updated**: 2025-01-11
**Related Commit**: ba2f1b4
**Status**: Ready for deployment
