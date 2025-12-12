# Customer Management API Reference

## Overview
Standard CRM customer management following industry best practices for contact/customer lifecycle management.

## Authentication
All endpoints require JWT authentication via `Authorization: Bearer <token>` header.

## Base URL
```
/api/v2/customers
```

---

## 📋 Customer CRUD Operations

### 1. List Customers (with filters & pagination)
```http
GET /api/v2/customers
```

**Query Parameters:**
- `page` (default: 1) - Page number
- `limit` (default: 20) - Items per page
- `search` - Search in phoneNumber, firstName, lastName, email
- `status` - Filter by: active, inactive, blocked, vip
- `segment` - Filter by: vip, regular, new, inactive
- `tags` - Comma-separated tags to filter
- `sortBy` (default: lastInteraction) - Field to sort by
- `sortOrder` (default: desc) - asc or desc

**Example:**
```bash
GET /api/v2/customers?page=1&limit=20&status=active&segment=vip&search=john
```

**Response:**
```json
{
  "success": true,
  "customers": [...],
  "pagination": {
    "page": 1,
    "limit": 20,
    "total": 156,
    "pages": 8
  }
}
```

---

### 2. Get Customer Details
```http
GET /api/v2/customers/:id
```

**Response:**
```json
{
  "success": true,
  "customer": {
    "_id": "...",
    "phoneNumber": "529991234567",
    "firstName": "John",
    "lastName": "Doe",
    "email": "john@example.com",
    "status": "active",
    "segment": "vip",
    "tags": ["premium", "loyal"],
    ...
  },
  "statistics": {
    "totalConversations": 45,
    "openConversations": 2,
    "resolvedConversations": 43
  },
  "recentConversations": [...]
}
```

---

### 3. Create Customer
```http
POST /api/v2/customers
```

**Body:**
```json
{
  "phoneNumber": "529991234567",
  "firstName": "John",
  "lastName": "Doe",
  "email": "john@example.com",
  "tags": ["premium"],
  "segment": "new",
  "source": "whatsapp",
  "address": {
    "street": "123 Main St",
    "city": "Cancún",
    "state": "Quintana Roo",
    "country": "México",
    "postalCode": "77500"
  },
  "notes": "VIP customer - priority support",
  "customFields": {
    "birthday": "1990-05-15",
    "company": "Acme Corp"
  },
  "preferences": {
    "language": "es",
    "communicationHours": {
      "start": "09:00",
      "end": "18:00"
    }
  }
}
```

**Response:**
```json
{
  "success": true,
  "customer": {...}
}
```

---

### 4. Update Customer (Full Edit)
```http
PUT /api/v2/customers/:id
```

**Body:** (same as create, all fields optional)
```json
{
  "firstName": "John",
  "lastName": "Smith",
  "email": "john.smith@example.com",
  "segment": "vip",
  "notes": "Updated notes"
}
```

**Response:**
```json
{
  "success": true,
  "customer": {...}
}
```

---

### 5. Update Customer Tags (Segmentation)
```http
PATCH /api/v2/customers/:id/tags
```

**Body:**
```json
{
  "tags": ["premium", "loyal", "high-value"],
  "action": "set"  // "set", "add", or "remove"
}
```

**Actions:**
- `set` - Replace all tags
- `add` - Add new tags (no duplicates)
- `remove` - Remove specified tags

**Response:**
```json
{
  "success": true,
  "customer": {...}
}
```

---

### 6. Block/Unblock Customer
```http
PATCH /api/v2/customers/:id/block
```

**Body:**
```json
{
  "isBlocked": true,
  "blockReason": "Spam or abusive behavior"
}
```

**Response:**
```json
{
  "success": true,
  "customer": {...}
}
```

---

### 7. Delete Customer
```http
DELETE /api/v2/customers/:id?permanent=false
```

**Query Parameters:**
- `permanent` (default: false)
  - `false` - Soft delete (status → inactive)
  - `true` - Hard delete (removes customer + conversations + messages)

**Response:**
```json
{
  "success": true,
  "message": "Customer deactivated"
}
```

---

## 📊 Customer Analytics & Reporting

### 8. Get Customer Statistics
```http
GET /api/v2/customers/stats/summary
```

**Response:**
```json
{
  "success": true,
  "summary": {
    "totalCustomers": 1250,
    "activeCustomers": 980,
    "vipCustomers": 45,
    "blockedCustomers": 12,
    "newThisMonth": 78
  },
  "segments": [
    { "_id": "vip", "count": 45 },
    { "_id": "regular", "count": 850 },
    { "_id": "new", "count": 355 }
  ]
}
```

---

### 9. Get Customer Conversations
```http
GET /api/v2/customers/:id/conversations?page=1&limit=20
```

**Response:**
```json
{
  "success": true,
  "conversations": [...],
  "pagination": {
    "page": 1,
    "limit": 20,
    "total": 45,
    "pages": 3
  }
}
```

---

## 📥 Import/Export Operations

### 10. Bulk Import Customers
```http
POST /api/v2/customers/bulk/import
```

**Body:**
```json
{
  "customers": [
    {
      "phoneNumber": "529991111111",
      "firstName": "Customer1",
      "email": "customer1@example.com"
    },
    {
      "phoneNumber": "529992222222",
      "firstName": "Customer2",
      "email": "customer2@example.com"
    }
  ]
}
```

**Response:**
```json
{
  "success": true,
  "results": {
    "imported": 45,
    "duplicates": 5,
    "failed": 2
  },
  "details": {
    "success": [...],
    "duplicates": [...],
    "failed": [...]
  }
}
```

---

### 11. Export Customers
```http
GET /api/v2/customers/export?format=json&status=active
```

**Query Parameters:**
- `format` - "json" or "csv"
- `status`, `segment`, `tags` - Filters (same as list)

**Response:**
- JSON: `application/json` with customers array
- CSV: `text/csv` with headers

**Example CSV output:**
```csv
phoneNumber,firstName,lastName,email,status,segment,tags,notes,createdAt,lastInteraction
"529991234567","John","Doe","john@example.com","active","vip","premium;loyal","VIP customer","2024-01-15T10:30:00.000Z","2024-12-10T15:45:00.000Z"
```

---

## 🏷️ Customer Model Fields

### Core Fields
- `phoneNumber` (String, required, unique) - Primary identifier
- `firstName` (String)
- `lastName` (String)
- `email` (String, lowercase)
- `avatar` (String, URL)

### Contact Information
- `alternativePhones` (Array of Strings)
- `address` (Object)
  - `street`, `city`, `state`, `country`, `postalCode`
  - `coordinates` (latitude, longitude)

### Segmentation
- `tags` (Array of Strings) - Custom labels
- `segment` (Enum: vip, regular, new, inactive)
- `source` (Enum: whatsapp, referral, website, social_media, other)

### Custom Data
- `customFields` (Map of String) - Flexible key-value pairs

### Preferences
- `preferences.language` (String, default: "es")
- `preferences.communicationHours` (start, end times)
- `preferences.preferredAgent` (ObjectId ref Agent)

### Status & Management
- `status` (Enum: active, inactive, blocked, vip)
- `isBlocked` (Boolean)
- `blockReason` (String)
- `notes` (String) - Internal notes

### Statistics (Auto-calculated)
- `statistics.totalConversations`
- `statistics.totalMessages`
- `statistics.totalTickets`
- `statistics.averageResponseTime`
- `statistics.satisfactionScore` (1-5)

### Timestamps
- `firstContact` (Date) - First interaction
- `lastInteraction` (Date) - Most recent activity
- `lastMessageAt` (Date)
- `createdAt` (Date, auto)
- `updatedAt` (Date, auto)

---

## 🔍 Search & Filter Best Practices

### 1. Full-text search
```
GET /api/v2/customers?search=john
```
Searches across: phoneNumber, firstName, lastName, email

### 2. Tag-based filtering
```
GET /api/v2/customers?tags=premium,loyal
```
Customers with ANY of the specified tags

### 3. Multi-filter combination
```
GET /api/v2/customers?status=active&segment=vip&search=john&sortBy=lastInteraction&sortOrder=desc
```

### 4. Dashboard statistics
```
GET /api/v2/customers/stats/summary
```

---

## 🎯 CRM Standard Operations Implemented

✅ **CRUD Operations**
- Create, Read, Update, Delete customers

✅ **Search & Filter**
- Full-text search
- Multi-field filtering
- Pagination

✅ **Segmentation**
- Customer segments (VIP, Regular, New, Inactive)
- Custom tags
- Source tracking

✅ **Bulk Operations**
- Import (JSON)
- Export (JSON, CSV)

✅ **Relationship Management**
- Link to conversations
- Agent preferences
- Interaction history

✅ **Analytics**
- Customer statistics
- Segment distribution
- Activity tracking

✅ **Data Protection**
- Soft delete (default)
- Hard delete (optional)
- Block/unblock

---

## 🚀 Usage Examples

### Frontend Integration
```typescript
// List customers with filters
const response = await fetch('/api/v2/customers?status=active&page=1&limit=20', {
  headers: { 'Authorization': `Bearer ${token}` }
});
const { customers, pagination } = await response.json();

// Update customer
await fetch(`/api/v2/customers/${customerId}`, {
  method: 'PUT',
  headers: {
    'Authorization': `Bearer ${token}`,
    'Content-Type': 'application/json'
  },
  body: JSON.stringify({
    firstName: 'John',
    segment: 'vip',
    tags: ['premium', 'loyal']
  })
});

// Export to CSV
window.open(`/api/v2/customers/export?format=csv&status=active&token=${token}`);
```

---

## 📝 Notes

1. **Phone Number Format**: Use 12-digit format (529991234567) for Mexico
2. **Authentication**: All endpoints require valid JWT token
3. **Pagination**: Default 20 items per page, max 100
4. **Soft Delete**: Default delete operation preserves data (status → inactive)
5. **Statistics**: Auto-updated when conversations/messages are created
6. **Tags**: Case-sensitive, use consistent naming convention
7. **Custom Fields**: Store any additional data as key-value pairs

---

## 🔐 Security Considerations

- All endpoints protected by authentication middleware
- Phone number uniqueness enforced at DB level
- Input validation via Mongoose schemas
- Soft delete by default to preserve audit trail
- Block feature to prevent spam/abuse
