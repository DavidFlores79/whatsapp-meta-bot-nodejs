# E-commerce Integration - Complete Workflow Guide

## Overview

The WhatsApp CRM Bot supports full e-commerce integration, enabling customers to **browse products, create orders, and get support** - all through WhatsApp conversations powered by AI.

---

## 🎯 Dual Capability: Sales + Support

E-commerce customers can interact in two ways:

### 1. 🛒 **Sales Flow** (Create Orders)
Browse products, place orders, and track deliveries

### 2. 🎫 **Support Flow** (Create Tickets)
Get help with returns, refunds, defective products, or inquiries

---

## 🛒 Sales Flow: Order Creation

### Prerequisites
- E-commerce preset must be active (`presetId: 'ecommerce'`)
- E-commerce integration enabled in configuration
- External e-commerce API configured (backend system)
- Order creation feature enabled (`orderCreate: true`)

### Step-by-Step Process

#### 1. Product Discovery
```
Customer: "I'm looking for Italian pasta"

AI uses: search_ecommerce_products
Parameters:
  - query: "pasta"
  - limit: 10

Response:
┌────────────────────────────────────────────┐
│ 🍝 Spaghetti Barilla 500g                  │
│ Price: $2.50 | Stock: 45 units             │
│ Made in Italy, premium quality             │
│ Product ID: 507f1f77bcf86cd799439011       │
├────────────────────────────────────────────┤
│ 🍝 Penne Rigate De Cecco 500g              │
│ Price: $3.20 | Stock: 30 units             │
│ Bronze-cut pasta, organic                  │
│ Product ID: 507f1f77bcf86cd799439022       │
└────────────────────────────────────────────┘
```

#### 2. Product Selection & Quantity
```
Customer: "I want 2 packs of Spaghetti Barilla"

AI collects:
  - product_id: "507f1f77bcf86cd799439011" (from search)
  - quantity: 2
  - unit_price: 2.50
  - subtotal: $5.00
```

#### 3. Shipping Information
```
AI: "Where should we deliver your order?"

Customer: "123 Main Street, Apartment 4B, Rome"

AI collects:
  - shipping_address: "123 Main Street, Apartment 4B"
  - city: "Rome"
  - state: "Lazio"
  - postal_code: "00100"
  - country: "Italy"
```

#### 4. Payment Method Selection
```
AI: "How would you like to pay?"

Payment Options:
  1. Cash on delivery
  2. Credit/Debit card
  3. Bank transfer
  4. PayPal

Customer: "Cash on delivery"

AI collects:
  - payment_method: "cash_on_delivery"
```

#### 5. Order Summary & Confirmation
```
AI shows summary:
┌────────────────────────────────────────────┐
│ 📦 ORDER SUMMARY                           │
├────────────────────────────────────────────┤
│ Product: Spaghetti Barilla 500g            │
│ Quantity: 2                                │
│ Unit Price: $2.50                          │
│ Subtotal: $5.00                            │
│                                            │
│ Shipping: $3.00                            │
│ Tax: $0.80                                 │
│ TOTAL: $8.80                               │
│                                            │
│ Delivery to:                               │
│ 123 Main Street, Apartment 4B              │
│ Rome, Lazio 00100, Italy                   │
│                                            │
│ Payment: Cash on delivery                  │
└────────────────────────────────────────────┘

AI: "Please type CONFIRM to place your order"
```

#### 6. Order Creation
```
Customer: "CONFIRM"

AI uses: create_ecommerce_order
Parameters:
  - customer_phone: "529991234567"
  - customer_name: "Giovanni Rossi"
  - customer_email: "giovanni@example.com"
  - items: [
      {
        product_id: "507f1f77bcf86cd799439011",
        product_name: "Spaghetti Barilla 500g",
        quantity: 2,
        unit_price: 2.50
      }
    ]
  - shipping_address: { ... }
  - payment_method: "cash_on_delivery"
  - notes: "Please ring doorbell twice"

Backend API Response:
{
  "success": true,
  "order": {
    "order_id": "ORD-2026-00123",
    "order_number": "LBI-20260111-00123",
    "status": "pending",
    "total": 8.80,
    "estimated_delivery": "2026-01-15",
    "tracking_url": "https://track.example.com/ORD-2026-00123"
  }
}

AI Response:
"✅ Order confirmed! Your order #ORD-2026-00123 will arrive by January 15, 2026.
You'll pay $8.80 cash on delivery. Track your order: [link]"
```

#### 7. Order Tracking
```
Customer (later): "Where's my order #ORD-2026-00123?"

AI uses: get_ecommerce_order
Parameters:
  - search_type: "order_id"
  - search_value: "ORD-2026-00123"

Response:
┌────────────────────────────────────────────┐
│ 📦 Order #ORD-2026-00123                   │
├────────────────────────────────────────────┤
│ Status: In Transit 🚚                      │
│ Expected: January 15, 2026                 │
│                                            │
│ Timeline:                                  │
│ ✅ Jan 11 - Order Placed                   │
│ ✅ Jan 11 - Payment Confirmed              │
│ ✅ Jan 12 - Order Shipped                  │
│ 🚚 Jan 13 - In Transit (current)           │
│ ⏳ Jan 15 - Estimated Delivery             │
└────────────────────────────────────────────┘
```

---

## 🎫 Support Flow: Ticket Creation

### When to Create Support Tickets

E-commerce customers can create support tickets for:

#### Available Ticket Categories:
1. **product_inquiry** - Questions about products, stock, specifications
2. **return_exchange** - Return or exchange requests
3. **shipping_issue** - Late delivery, wrong address, lost package
4. **payment_issue** - Incorrect charges, refund requests
5. **product_defect** - Damaged or defective products
6. **other** - General inquiries

### Support Workflow Examples

#### Example 1: Product Return (After Purchase)
```
Customer: "I received a defective product in order #ORD-2026-00123"

AI Workflow:
1. Detects issue with existing order
2. Uses get_ecommerce_order to verify order exists
3. Collects ticket information:
   - Order number: ORD-2026-00123
   - Product name: Spaghetti Barilla 500g
   - Issue: Packaging damaged, product leaked
   - Photos: [customer sends via WhatsApp]
   - Preferred resolution: Replacement

4. Creates support ticket:
   AI uses: create_ticket_report
   Parameters:
     - category: "product_defect"
     - subject: "Defective product in order #ORD-2026-00123"
     - description: "Package damaged, product leaked"
     - priority: "high"
     - order_reference: "ORD-2026-00123"

5. Response:
   "✅ I've created ticket #ORD-2026-00456 for your issue.
   An agent will review your case and process the replacement within 24 hours.
   Reference: Order #ORD-2026-00123"

Result:
  - Ticket created with businessType: 'ecommerce'
  - Linked to order ORD-2026-00123
  - Agent receives notification
  - Customer receives ticket ID for tracking
```

#### Example 2: Pre-Purchase Inquiry (No Order)
```
Customer: "Do you have gluten-free pasta options?"

AI Workflow:
1. Recognizes as product inquiry
2. Can search products: search_ecommerce_products("gluten-free pasta")
3. If specific answer needed, creates inquiry ticket:

   AI uses: create_ticket_report
   Parameters:
     - category: "product_inquiry"
     - subject: "Gluten-free pasta availability"
     - description: "Customer inquiring about gluten-free options"
     - priority: "medium"

4. Response:
   "✅ I've created inquiry #ORD-2026-00457.
   An agent will provide detailed information about our gluten-free products shortly."

Result:
  - Ticket created without order reference
  - businessType: 'ecommerce'
  - Agent provides expert guidance
```

#### Example 3: Late Delivery Complaint
```
Customer: "My order #ORD-2026-00120 was supposed to arrive yesterday!"

AI Workflow:
1. Checks order status: get_ecommerce_order
2. Verifies delivery is indeed late
3. Creates shipping issue ticket:

   AI uses: create_ticket_report
   Parameters:
     - category: "shipping_issue"
     - subject: "Late delivery - Order #ORD-2026-00120"
     - description: "Order expected Jan 13, still not delivered"
     - priority: "urgent"
     - order_reference: "ORD-2026-00120"

4. Response:
   "⚠️ I'm sorry for the delay! I've created urgent ticket #ORD-2026-00458.
   Our team will investigate the delivery status immediately and update you within 2 hours.
   Order #ORD-2026-00120"

Result:
  - Urgent priority ticket
  - Agent contacts shipping company
  - Customer receives proactive updates
```

---

## 🔄 Complete Customer Journey Examples

### Journey 1: Happy Path (Order Only)
```
1. Customer: "Show me Italian products"
   → AI searches products
   
2. Customer: "I want the Spaghetti"
   → AI collects order details
   
3. Customer: "CONFIRM"
   → AI creates order via API
   
4. Result: Order placed successfully
   ✅ No ticket needed
   📦 Order status: pending
```

### Journey 2: Order + Support (Problem After Purchase)
```
1. Customer places order #ORD-2026-00123
   → Order created via create_ecommerce_order
   
2. [2 days later]
   Customer: "The pasta box was damaged!"
   → AI creates ticket #ORD-2026-00456 (product_defect)
   
3. Agent reviews ticket
   → Approves replacement
   
4. Agent creates new order for replacement
   → System links to original order
   
5. Result: Customer satisfied
   ✅ Original order: ORD-2026-00123
   ✅ Support ticket: ORD-2026-00456 (resolved)
   ✅ Replacement order: ORD-2026-00124
```

### Journey 3: Support First, Order Later (Inquiry)
```
1. Customer: "Do you deliver to Sicily?"
   → AI creates ticket #ORD-2026-00459 (product_inquiry)
   
2. Agent responds: "Yes, we deliver to Sicily!"
   → Ticket marked resolved
   
3. [1 hour later]
   Customer: "Great! I want to order pasta"
   → AI helps place order #ORD-2026-00125
   
4. Result: Inquiry converted to sale
   ✅ Ticket: ORD-2026-00459 (inquiry, resolved)
   ✅ Order: ORD-2026-00125 (created)
```

---

## 🔒 Business Type Isolation

### E-commerce Preset Boundaries

When **ecommerce preset** is active:

#### ✅ Enabled Features:
- `search_ecommerce_products` - Product search
- `create_ecommerce_order` - Order placement
- `get_ecommerce_order` - Order tracking
- `get_active_orders` - Recent orders list
- `create_ticket_report` - Support tickets (ecommerce categories only)
- `get_ticket_information` - View ecommerce tickets only

#### ❌ Disabled Features:
- Cannot see luxfree tickets (solar/lighting issues)
- Cannot see restaurant tickets (food delivery issues)
- Cannot see healthcare tickets (medical appointments)
- Cannot create tickets with non-ecommerce categories

#### Database Isolation:
```javascript
// All ecommerce tickets are stored with:
{
  ticketId: "ORD-2026-00456",
  businessType: "ecommerce",  // ← Isolation field
  category: "product_defect",  // ← Ecommerce-specific category
  presetSnapshot: {
    presetId: "ecommerce",
    assistantName: "ShopAssist",
    companyName: "TiendaOnline"
  }
}

// All ecommerce orders are tracked separately from other business types
```

### Cross-Business Prevention

#### Scenario: Customer Uses Multiple Services
```
Customer Phone: +52 999 123 4567

Services Used:
1. Luxfree (solar panel installation)
   → Creates ticket: LUX-2026-00001
   → businessType: 'luxfree'

2. E-commerce (online shopping)
   → Creates order: ORD-2026-00123
   → Creates ticket: ORD-2026-00456
   → businessType: 'ecommerce'

When Luxfree Preset Active:
  ✅ Shows: LUX-2026-00001
  ❌ Hides: ORD-2026-00456 (different business)

When Ecommerce Preset Active:
  ✅ Shows: ORD-2026-00456
  ❌ Hides: LUX-2026-00001 (different business)
```

---

## 🔧 Configuration

### Enable E-commerce Integration

#### Option 1: Environment Variables
```env
# E-commerce API Configuration
ECOMMERCE_API_URL=https://api.labellaitalia.com
ECOMMERCE_SERVICE_EMAIL=service@shop.com
ECOMMERCE_SERVICE_PASSWORD=secure_password

# Feature Flags
ECOMMERCE_ORDER_CREATE=true
ECOMMERCE_ORDER_LOOKUP=true
ECOMMERCE_PRODUCT_SEARCH=true
```

#### Option 2: Database Configuration
```javascript
// Create via EcommerceConfig model
const ecommerceConfig = {
  enabled: true,
  connection: {
    apiUrl: "https://api.labellaitalia.com",
    serviceEmail: "service@shop.com",
    servicePassword: "secure_password"
  },
  features: {
    orderLookup: true,
    orderCreate: true,      // ← Enable order creation
    productSearch: true,
    customerLink: true,
    webhooks: false
  }
};
```

### Activate E-commerce Preset

```javascript
// Update assistant configuration
await configService.updateSetting('assistant_configuration', {
  presetId: 'ecommerce',
  assistantName: 'ShopAssist',
  companyName: 'TiendaOnline',
  primaryServiceIssue: 'problemas con productos, envíos o devoluciones',
  serviceType: 'compras en línea',
  ticketNoun: 'solicitud',
  ticketNounPlural: 'solicitudes',
  language: 'es'
});
```

---

## 📊 Monitoring & Analytics

### Track E-commerce Performance

#### Order Metrics:
```javascript
// Total orders created via WhatsApp
db.orders.countDocuments({ source: "whatsapp" })

// Conversion rate (orders / conversations)
db.conversations.aggregate([
  { $match: { businessType: "ecommerce" } },
  { $lookup: { from: "orders", ... } }
])
```

#### Support Metrics:
```javascript
// E-commerce tickets by category
db.tickets.aggregate([
  { $match: { businessType: "ecommerce" } },
  { $group: { _id: "$category", count: { $sum: 1 } } }
])

// Average resolution time for product_defect tickets
db.tickets.aggregate([
  { $match: { 
      businessType: "ecommerce",
      category: "product_defect"
  }},
  { $group: { 
      _id: null, 
      avgTime: { $avg: "$resolutionTime" }
  }}
])
```

---

## 🚀 Best Practices

### For Order Flow:
1. ✅ Always search products first to get correct `product_id`
2. ✅ Validate stock before confirming order
3. ✅ Show complete order summary before confirmation
4. ✅ Provide tracking information immediately after order
5. ✅ Send order confirmation via WhatsApp template

### For Support Flow:
1. ✅ Create tickets for all unresolved issues
2. ✅ Link tickets to orders when applicable (use `order_reference`)
3. ✅ Set appropriate priority (urgent for delivery issues)
4. ✅ Collect photos via WhatsApp for defective products
5. ✅ Follow up with customers after ticket resolution

### For Business Isolation:
1. ✅ Always verify active preset before operations
2. ✅ Never manually change `businessType` on tickets
3. ✅ Use preset-specific categories only
4. ✅ Test isolation after preset changes
5. ✅ Monitor cross-business access attempts (should be zero)

---

## 📚 Related Documentation

- [Business Type Isolation](BUSINESS_TYPE_ISOLATION.md) - Complete isolation architecture
- [Configuration Service](../src/services/configurationService.js) - Preset management
- [E-commerce Integration Service](../src/services/ecommerceIntegrationService.js) - API implementation
- [Ticket Service](../src/services/ticketService.js) - Ticket management
- [API Documentation](API_DOCUMENTATION.md) - REST API endpoints

---

## 🆘 Troubleshooting

### Issue: "E-commerce integration not available"
**Solution:** 
1. Check preset is 'ecommerce'
2. Verify `ECOMMERCE_API_URL` is set
3. Ensure `ecommerceConfig.enabled = true`

### Issue: "Cannot create order"
**Solution:**
1. Check `orderCreate` feature is enabled
2. Verify API credentials are correct
3. Test external API connectivity

### Issue: "Tickets mixing between businesses"
**Solution:**
1. Run `pnpm run migrate:business-type`
2. Verify all tickets have `businessType` field
3. Check active preset matches query

---

**Last Updated:** January 11, 2026  
**Status:** ✅ Production Ready  
**Integration:** La Bella Italia E-commerce API
