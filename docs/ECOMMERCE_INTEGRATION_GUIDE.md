# E-commerce Integration Guide

## Overview

This document describes how to integrate the WhatsApp CRM Bot with an external e-commerce backend API. This integration enables **bi-directional** communication:

### From CRM to E-commerce (Read)
- Check order status via WhatsApp
- Get order history and delivery information
- Search for product availability and prices
- Customer account linking

### From CRM to E-commerce (Write - Optional)
- Create orders via WhatsApp (phone ordering)
- Update order status
- Agent-assisted ordering through CRM interface

## Prerequisites: Preset-Based Availability

**IMPORTANT:** E-commerce integration is only available when the `ecommerce` preset is active.

| Preset ID | E-commerce Available | Notes |
|-----------|---------------------|-------|
| `ecommerce` | ✅ Yes | La Bella Italia integration |
| `restaurant` | ❌ No | Will have separate integration |
| `luxfree` | ❌ No | - |
| `healthcare` | ❌ No | - |
| Other presets | ❌ No | - |

This ensures that each business type uses its own dedicated integration.

## Architecture

```
┌─────────────────────┐     ┌──────────────────────┐     ┌─────────────────────────┐
│   WhatsApp User     │◀───▶│   WhatsApp Meta Bot  │◀───▶│  E-commerce Backend API │
│                     │     │   (CRM + AI)         │     │  (Your Store)           │
└─────────────────────┘     └──────────────────────┘     └─────────────────────────┘
                                     │                              │
                                     ├──────────────────────────────┤
                                     │                              │
                              ┌──────▼──────┐               ┌───────▼───────┐
                              │   OpenAI    │               │   MongoDB     │
                              │  Assistant  │               │   (Orders,    │
                              │ (Function   │               │   Products,   │
                              │  Calling)   │               │   Customers)  │
                              └─────────────┘               └───────────────┘

Bi-directional Data Flow:
─────────────────────────
READ:  Orders, Products, Customers, Categories, Dashboard
WRITE: Create Orders, Update Order Status (if enabled)
```

## Configuration Methods

The integration supports three configuration methods (in priority order):

### 1. Database Configuration (Recommended)

Configure via the CRM admin panel or API:

```javascript
// EcommerceConfig model structure
{
  enabled: true,
  connection: {
    apiUrl: 'http://your-ecommerce-api.com',
    authType: 'jwt',
    serviceEmail: 'service@yourstore.com',
    servicePassword: '***'
  },
  features: {
    orderLookup: true,      // Read order information
    orderCreate: false,     // Create orders via WhatsApp (disabled by default)
    productSearch: true,    // Search product catalog
    customerLink: true,     // Link WhatsApp users to store accounts
    webhooks: false,        // Receive real-time updates (future)
    orderNotifications: true // Send order confirmations
  }
}
```

### 2. Legacy Configuration (configurationService)

Store settings using the existing configuration service:

```javascript
await configService.setSetting('ecommerce_integration', {
  enabled: true,
  apiUrl: 'http://your-ecommerce-api.com',
  serviceEmail: 'service@yourstore.com',
  servicePassword: '***',
  features: { /* ... */ }
});
```

### 3. Environment Variables (Fallback)

```env
# E-commerce API Integration
ECOMMERCE_API_URL=http://localhost:3000
ECOMMERCE_SERVICE_EMAIL=service@yourstore.com
ECOMMERCE_SERVICE_PASSWORD=your_secure_password

# Optional: API Key authentication
ECOMMERCE_API_KEY=your_api_key_here
```

## Setup Steps

### Step 1: Create Service Account

In your e-commerce backend, create a dedicated service account:

```javascript
// Example: Creating service user in e-commerce system
const User = require('./models/User');

await User.create({
  email: 'crm-service@yourstore.com',
  password: await bcrypt.hash('secure_password', 10),
  name: 'CRM Integration Service',
  role: 'admin',  // Or a custom 'api_service' role
  status: true
});
```

Required API permissions:
- `GET /api/orders` - List/search orders
- `GET /api/orders/:id` - Get order details
- `GET /api/products` - Search products
- `GET /api/users` - Find customers
- `GET /api/categories` - List categories
- `GET /api/dashboard` - Summary stats
- `POST /api/orders` - Create orders (if orderCreate enabled)
- `PUT /api/orders/:id` - Update orders (if orderCreate enabled)

### Step 2: Configure Integration

**Option A: Via CRM Admin Panel**

1. Navigate to Settings > E-commerce Integration
2. Enter your API URL and credentials
3. Enable desired features
4. Test connection
5. Save configuration

**Option B: Via API**

```bash
curl -X PUT http://your-crm:3010/api/v2/ecommerce/config \
  -H "Authorization: Bearer YOUR_JWT" \
  -H "Content-Type: application/json" \
  -d '{
    "enabled": true,
    "connection": {
      "apiUrl": "http://your-ecommerce:3000",
      "authType": "jwt",
      "serviceEmail": "service@yourstore.com",
      "servicePassword": "secure_password"
    },
    "features": {
      "orderLookup": true,
      "orderCreate": true,
      "productSearch": true
    }
  }'
```

### Step 3: Add OpenAI Functions

Add the function definitions to your OpenAI Assistant:

1. Go to [OpenAI Platform](https://platform.openai.com/assistants)
2. Select your assistant
3. Add functions from:
   - `docs/OPENAI_FUNCTION_get_ecommerce_order.json`
   - `docs/OPENAI_FUNCTION_search_ecommerce_products.json`
   - `docs/OPENAI_FUNCTION_create_ecommerce_order.json` (if orderCreate enabled)
   - `docs/OPENAI_FUNCTION_get_active_orders.json`

### Step 4: Verify Integration

Test the connection:

```bash
# Test via API
curl -X POST http://your-crm:3010/api/v2/ecommerce/config/test \
  -H "Authorization: Bearer YOUR_ADMIN_JWT"

# Check status
curl http://your-crm:3010/api/v2/ecommerce/status \
  -H "Authorization: Bearer YOUR_JWT"
```

## Available AI Functions

### get_ecommerce_order

Search for orders by order ID, phone, or email.

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| search_type | string | Yes | `order_id`, `phone`, or `email` |
| search_value | string | Yes | Value to search for |
| include_items | boolean | No | Include order items (default: true) |

**Example:**
```
Customer: "¿Cuál es el estado de mi pedido ORD-2025-000123?"
→ AI calls: get_ecommerce_order({ search_type: "order_id", search_value: "ORD-2025-000123" })
```

### search_ecommerce_products

Search the product catalog.

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| query | string | Yes | Search query |
| limit | integer | No | Max results (default: 5, max: 10) |

**Example:**
```
Customer: "¿Tienen pizza vegetariana?"
→ AI calls: search_ecommerce_products({ query: "pizza vegetariana", limit: 5 })
```

### get_active_orders

Get pending/processing orders for a customer.

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| phone | string | Yes | Customer phone number |

**Example:**
```
Customer: "¿Cuáles son mis pedidos activos?"
→ AI calls: get_active_orders({ phone: "529991234567" })
```

### create_ecommerce_order (Requires orderCreate feature)

Create a new order via WhatsApp.

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| customer_phone | string | Yes | Customer phone |
| items | array | Yes | `[{ product_id, quantity }]` |
| payment_method | string | No | cash, credit_card, paypal, bank_transfer |
| address | string | No | Delivery address |
| delivery_option | string | No | pickup, delivery |
| delivery_date | string | No | ISO date format |
| notes | string | No | Order notes |

**Example:**
```
Customer: "Quiero ordenar 2 pizzas margarita para recoger"
→ AI searches products, confirms, then:
→ AI calls: create_ecommerce_order({
    customer_phone: "529991234567",
    items: [{ product_id: "xxx", quantity: 2 }],
    delivery_option: "pickup",
    payment_method: "cash"
  })
```

## CRM API Endpoints

### Status & Configuration

| Endpoint | Method | Access | Description |
|----------|--------|--------|-------------|
| `/api/v2/ecommerce/status` | GET | Admin | Get integration status |
| `/api/v2/ecommerce/config` | GET | Admin | Get configuration |
| `/api/v2/ecommerce/config` | PUT | Admin | Update configuration |
| `/api/v2/ecommerce/config/test` | POST | Admin | Test connection |
| `/api/v2/ecommerce/health` | GET | Agent | Check API health |

### Order Management

| Endpoint | Method | Access | Description |
|----------|--------|--------|-------------|
| `/api/v2/ecommerce/orders/search` | GET | Agent | Search orders |
| `/api/v2/ecommerce/orders/active/:phone` | GET | Agent | Get active orders |
| `/api/v2/ecommerce/orders` | POST | Agent | Create order |

### Product Catalog

| Endpoint | Method | Access | Description |
|----------|--------|--------|-------------|
| `/api/v2/ecommerce/products/search` | GET | Agent | Search products |
| `/api/v2/ecommerce/products/:id` | GET | Agent | Get product details |
| `/api/v2/ecommerce/categories` | GET | Agent | List categories |

### Customer Data

| Endpoint | Method | Access | Description |
|----------|--------|--------|-------------|
| `/api/v2/ecommerce/customer/:phone` | GET | Agent | Find customer |
| `/api/v2/ecommerce/customer/:phone/profile` | GET | Agent | Customer profile with stats |

### Reference Data

| Endpoint | Method | Access | Description |
|----------|--------|--------|-------------|
| `/api/v2/ecommerce/delivery-options` | GET | Agent | Available delivery options |
| `/api/v2/ecommerce/payment-methods` | GET | Agent | Available payment methods |
| `/api/v2/ecommerce/dashboard` | GET | Admin | E-commerce summary |

## E-commerce Backend API Endpoints

These are the endpoints that your external e-commerce API must implement. The CRM bot will call these endpoints using the configured service credentials.

### Order Management

| Endpoint | Method | Access | Description |
|----------|--------|--------|-------------|
| `/api/orders/search` | GET | Agent | Search orders by orderId, phone, or email |
| `/api/orders/active/:phone` | GET | Agent | Get active orders for customer |
| `/api/orders` | POST | Agent | Create order |

### Product Catalog

| Endpoint | Method | Access | Description |
|----------|--------|--------|-------------|
| `/api/products/search` | GET | Agent | Search products (use ?search= query param) |
| `/api/products/:id` | GET | Agent | Get product details |
| `/api/categories` | GET | Agent | List categories |

### Customer Data

| Endpoint | Method | Access | Description |
|----------|--------|--------|-------------|
| `/api/users/by-phone/:phone` | GET | Agent | Find customer by phone |
| `/api/users/:phone/profile` | GET | Agent | Customer profile with order stats |

### Reference Data

| Endpoint | Method | Access | Description |
|----------|--------|--------|-------------|
| `/api/delivery-options` | GET | Agent | Available delivery options |
| `/api/payment-methods` | GET | Agent | Available payment methods |
| `/api/dashboard` | GET | Admin | E-commerce summary |

## Data Mappings

### Order Status
| API Status | Display (Spanish) |
|------------|-------------------|
| pending | Pendiente |
| processing | En Proceso |
| completed | Completado |
| canceled | Cancelado |

### Payment Methods
| API Method | Display (Spanish) |
|------------|-------------------|
| cash | Efectivo |
| credit_card | Tarjeta de Crédito |
| paypal | PayPal |
| bank_transfer | Transferencia |

## Security Considerations

1. **Service Account**: Use dedicated account with minimal permissions
2. **Feature Flags**: Disable `orderCreate` unless explicitly needed
3. **Preset Gating**: Integration automatically disabled for non-compatible presets
4. **Token Management**: Auth tokens refreshed automatically, not persisted
5. **HTTPS**: Always use HTTPS in production
6. **Input Validation**: All inputs validated before API calls

## Example Conversations

### Order Status Check
```
Customer: Hola, quiero saber el estado de mi pedido

AI: ¡Hola! Con gusto te ayudo. ¿Tienes el número de pedido (ORD-2025-XXXXXX)?

Customer: Sí, es ORD-2025-000456

AI: [Calls get_ecommerce_order]
    📦 Pedido ORD-2025-000456
    
    📋 Estado: En Proceso
    💰 Total: $450.00
    💳 Pago: Tarjeta de Crédito
    📅 Entrega: viernes, 12 de enero
    
    Productos:
    • 2x Pizza Pepperoni - $300.00
    • 1x Tiramisú - $150.00
    
    ¡Tu pedido está siendo preparado!
```

### Phone Order (with orderCreate enabled)
```
Customer: Quiero ordenar pizza

AI: ¡Perfecto! Déjame mostrarte nuestras opciones.
    [Calls search_ecommerce_products]
    
    🍕 Pizzas disponibles:
    1. Pizza Margherita - $150.00
    2. Pizza Pepperoni - $170.00
    3. Pizza Vegetariana - $160.00
    
    ¿Cuál te gustaría?

Customer: 2 de pepperoni para recoger

AI: Perfecto, 2 Pizzas Pepperoni = $340.00
    ¿Método de pago: Efectivo o tarjeta?

Customer: Efectivo

AI: [Calls create_ecommerce_order]
    ✅ ¡Pedido creado!
    
    📦 Número: ORD-2025-000789
    💰 Total: $340.00
    🏪 Recoger en: Av. Principal 123
    ⏰ Estará listo en ~30 minutos
    
    ¡Gracias por tu pedido!
```

## Troubleshooting

### "Integration not available"
- Verify preset is `ecommerce` or `restaurant`
- Check configuration is enabled
- Review server logs for configuration errors

### "Authentication failed"
- Verify service credentials
- Check e-commerce API is running
- Test credentials directly: `curl POST /auth/login`

### "Customer not found"
- Customer must exist in e-commerce system
- Phone format must match (check `phoneFormat` setting)

### Empty results
- Verify data exists in e-commerce database
- Check search query parameters
- Review e-commerce API logs

## Future Enhancements

- [ ] Webhook receiver for real-time order updates
- [ ] Multi-store support (different e-commerce backends)
- [ ] Product inventory/stock display
- [ ] Payment status integration
- [ ] Delivery tracking links
- [ ] Promotional codes application
- [ ] Customer registration via WhatsApp
