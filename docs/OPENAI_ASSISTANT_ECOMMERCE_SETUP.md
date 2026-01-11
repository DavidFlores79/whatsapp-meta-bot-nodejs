# OpenAI Assistant E-commerce Setup Guide

## Problem
The AI Assistant is refusing to help with product searches and e-commerce requests, responding with:
> "Lo siento, pero solo puedo ayudar con solicitudes relacionadas con problemas, envíos, devoluciones o conectarte con un agente."

This happens because the Assistant's instructions are too restrictive.

## Solution
You need to update your OpenAI Assistant configuration to:
1. Add e-commerce function definitions
2. Update system instructions to allow product searches and order management

## Step 1: Add E-commerce Functions

Go to https://platform.openai.com/assistants and select your assistant (ID from `.env` OPENAI_ASSISTANT_ID).

Add these 4 functions:

### Function 1: search_ecommerce_products
```json
{
  "name": "search_ecommerce_products",
  "description": "Search for products in the e-commerce catalog. Use this function when a customer asks about product availability, prices, or product information.",
  "strict": true,
  "parameters": {
    "type": "object",
    "additionalProperties": false,
    "properties": {
      "query": {
        "type": "string",
        "description": "The search query - product name, category, or keywords to search for"
      },
      "limit": {
        "type": ["integer", "null"],
        "description": "Maximum number of products to return. Default is 5 if null, maximum is 10."
      }
    },
    "required": ["query", "limit"]
  }
}
```

### Function 2: get_ecommerce_order
```json
{
  "name": "get_ecommerce_order",
  "description": "Get details of a specific order by order ID. Use when customer asks about order status or provides an order number.",
  "strict": true,
  "parameters": {
    "type": "object",
    "additionalProperties": false,
    "properties": {
      "order_id": {
        "type": "string",
        "description": "The unique order identifier (e.g., 'ORD-2025-001234')"
      }
    },
    "required": ["order_id"]
  }
}
```

### Function 3: get_active_orders
```json
{
  "name": "get_active_orders",
  "description": "Get list of active orders for the current customer. Use when customer asks 'show me my orders' or 'what orders do I have'.",
  "strict": true,
  "parameters": {
    "type": "object",
    "additionalProperties": false,
    "properties": {
      "status": {
        "type": ["string", "null"],
        "description": "Optional filter by order status: 'pending', 'processing', 'shipped', 'delivered', 'cancelled'. Leave null for all active orders.",
        "enum": ["pending", "processing", "shipped", "delivered", "cancelled", null]
      },
      "limit": {
        "type": ["integer", "null"],
        "description": "Maximum number of orders to return. Default is 5 if null."
      }
    },
    "required": ["status", "limit"]
  }
}
```

### Function 4: create_ecommerce_order
```json
{
  "name": "create_ecommerce_order",
  "description": "Create a new order for the customer with selected products. Use after customer confirms they want to purchase specific products.",
  "strict": true,
  "parameters": {
    "type": "object",
    "additionalProperties": false,
    "properties": {
      "products": {
        "type": "array",
        "description": "Array of products to order",
        "items": {
          "type": "object",
          "properties": {
            "product_id": {
              "type": "string",
              "description": "The unique product identifier"
            },
            "quantity": {
              "type": "integer",
              "description": "Quantity to order (minimum 1)"
            }
          },
          "required": ["product_id", "quantity"],
          "additionalProperties": false
        }
      },
      "shipping_address": {
        "type": ["string", "null"],
        "description": "Customer's shipping address. Can be null if customer already has address on file."
      },
      "payment_method": {
        "type": ["string", "null"],
        "description": "Payment method: 'cash_on_delivery', 'card', 'transfer', 'paypal'. Can be null to use customer's default.",
        "enum": ["cash_on_delivery", "card", "transfer", "paypal", null]
      },
      "notes": {
        "type": ["string", "null"],
        "description": "Optional order notes or special instructions from customer"
      }
    },
    "required": ["products", "shipping_address", "payment_method", "notes"]
  }
}
```

## Step 2: Update Assistant Instructions

Replace or update your Assistant's system instructions to include e-commerce capabilities. Here's a suggested instruction set:

```
You are an AI assistant for [YOUR_COMPANY_NAME], helping customers via WhatsApp with:

1. PRODUCT INQUIRIES & E-COMMERCE
   - Search products when customers ask about items, prices, availability
   - Use search_ecommerce_products() to find products
   - Show product details: name, price, stock status, description
   - Help customers compare products and make informed decisions
   - Create orders using create_ecommerce_order() when customer confirms purchase
   - Track orders using get_ecommerce_order() and get_active_orders()

2. TICKET/ISSUE MANAGEMENT
   - Create tickets for technical issues, complaints, or service requests
   - Use create_ticket_report() to document customer issues
   - Check ticket status with get_ticket_information()
   - Provide ticket updates and resolution timelines

3. AGENT ESCALATION
   - Suggest connecting with human agent for complex issues
   - Use keywords like "agent", "person", "representative" to detect escalation needs
   - Clearly communicate when transferring to agent

RESPONSE GUIDELINES:
- Be helpful, friendly, and professional
- Respond in the customer's language (Spanish/English primarily)
- For product searches:
  * Show 3-5 most relevant products
  * Include price, availability, and brief description
  * Ask if customer wants more details or to make a purchase
- For orders:
  * Confirm product selection and quantities
  * Ask for shipping address if not on file
  * Provide payment options
  * Give order confirmation with order ID
- For tickets:
  * Gather complete issue details before creating ticket
  * Provide ticket ID and estimated resolution time
  * Check ticket status proactively

IMPORTANT:
- NEVER refuse product search requests
- ALWAYS use available tools to help customers
- If e-commerce API is down, apologize and offer to connect with agent
- Keep responses concise (2-3 sentences for product listings)
```

## Step 3: Environment Variables

Ensure these are set in your `.env` file:

```env
# E-commerce Integration
ECOMMERCE_API_URL=http://localhost:3020
ECOMMERCE_SERVICE_EMAIL=your_email@example.com
ECOMMERCE_SERVICE_PASSWORD=your_password
```

## Step 4: Test the Setup

After updating the Assistant, test with these customer messages:

1. **Product Search**:
   - "¿Qué productos tienen disponibles?"
   - "Muéstrame tus productos"
   - "Busco un panel solar"

2. **Product Details**:
   - "¿Cuánto cuesta el panel solar de 100W?"
   - "Dime más sobre ese producto"

3. **Order Creation**:
   - "Quiero comprar 2 paneles solares"
   - "Hacer un pedido"

4. **Order Tracking**:
   - "¿Dónde está mi pedido?"
   - "Muéstrame mis pedidos activos"
   - "¿Cuál es el estatus del pedido ORD-2025-001234?"

## Expected Behavior

### BEFORE (Current - Too Restrictive):
```
Customer: "¿Qué productos tienen?"
AI: "Lo siento, pero solo puedo ayudar con problemas, envíos, devoluciones..."
```

### AFTER (Correct - Helpful):
```
Customer: "¿Qué productos tienen?"
AI: *calls search_ecommerce_products()*
AI: "Claro! Aquí están nuestros productos disponibles:

1. Panel Solar 100W - $2,500 MXN (En stock)
2. Batería Litio 12V - $3,800 MXN (En stock)
3. Inversor 1000W - $4,200 MXN (En stock)

¿Te gustaría más información sobre alguno o realizar un pedido?"
```

## Troubleshooting

### Issue: AI still refuses to search products
**Solution**: Check that instructions explicitly allow product searches. Remove any restrictions like "only help with problems/issues".

### Issue: Function not found error
**Solution**: Verify function names match exactly: `search_ecommerce_products`, `get_ecommerce_order`, `create_ecommerce_order`, `get_active_orders`

### Issue: "strict": true validation errors
**Solution**: Ensure all required fields are included and additionalProperties is false. Check that enum values match backend expectations.

### Issue: E-commerce API connection errors
**Solution**:
1. Verify `ECOMMERCE_API_URL` is accessible from your server
2. Check `ECOMMERCE_SERVICE_EMAIL` and `ECOMMERCE_SERVICE_PASSWORD` are correct
3. Look at backend logs: `pm2 logs whatsapp --lines 100`

## Architecture Notes

- **Backend Handler**: `src/handlers/ecommerceFunctionHandler.js` processes all e-commerce function calls
- **Function Definitions**: JSON files in `docs/OPENAI_FUNCTION_*.json`
- **Service Integration**: Functions call external e-commerce API at `ECOMMERCE_API_URL`
- **Authentication**: Uses service account (email/password) to authenticate with e-commerce API

## Related Documentation

- E-commerce function implementation: `src/handlers/ecommerceFunctionHandler.js`
- OpenAI service integration: `src/services/openaiService.js` (lines 653-661)
- E-commerce routes: `src/routes/ecommerceRoutes.js`
- Ticket system setup: `docs/OPENAI_ASSISTANT_UPDATE_INSTRUCTIONS.md`

## Deployment Checklist

- [ ] Add all 4 e-commerce functions to OpenAI Assistant
- [ ] Update Assistant instructions to allow product searches
- [ ] Set environment variables in `.env`
- [ ] Deploy backend with updated `.env`
- [ ] Test all e-commerce scenarios
- [ ] Monitor logs for errors

---

**Last Updated**: 2025-01-11
**Related Issue**: AI refusing product search requests
**Status**: Ready for deployment
