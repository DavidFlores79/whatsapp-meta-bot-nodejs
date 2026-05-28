# Business Type Isolation Analysis & Implementation Guide

## Executive Summary

**Status:** ⚠️ **PARTIAL PROTECTION - NEEDS STRENGTHENING**

The universal ticket system has basic preset awareness but lacks complete isolation between different business types (luxfree, ecommerce, restaurant, healthcare).

---

## Current Protection Status

### ✅ What's Already Protected

1. **E-commerce Integration Functions**
   - Location: `src/services/ecommerceIntegrationService.js`
   - Protection: Only activates when preset is in `ECOMMERCE_COMPATIBLE_PRESETS`
   - Functions: `get_ecommerce_order`, `create_ecommerce_order`, `search_ecommerce_products`
   - **Result:** Luxfree users CANNOT access ecommerce functions ✅

2. **Preset-Specific Categories**
   - Each preset defines its own ticket categories
   - `ticketService.validateCategory()` checks against active preset's categories
   - **Result:** Cannot create luxfree tickets with ecommerce categories ✅

3. **Preset-Specific AI Instructions**
   - Each preset has custom instruction templates
   - Different terminology (reporte, caso, solicitud, consulta)
   - **Result:** AI behavior adapts to business type ✅

---

## ❌ Critical Vulnerabilities

### 1. **No Preset Field in Ticket Model**

**Problem:**
```javascript
// Ticket schema does NOT store which business created it
ticketSchema = {
    ticketId: String,
    category: String,  // Could be solar_installation OR product_inquiry
    customerId: ObjectId,
    // ❌ Missing: businessType or presetId
}
```

**Impact:**
- Tickets from all business types share the same MongoDB collection
- No way to distinguish luxfree tickets from ecommerce tickets
- Cross-contamination possible if presets are switched

**Example Attack Vector:**
1. Company uses luxfree preset → creates ticket "LUX-2026-000001" (solar_installation)
2. Company switches to ecommerce preset
3. AI could potentially access the old luxfree ticket
4. Customer sees irrelevant ticket from different business

---

### 2. **No Business Type Filter in Ticket Queries**

**Problem:**
```javascript
// src/services/ticketService.js
async getTicketsByCustomer(customerId, options) {
    // ❌ No filter by businessType/presetId
    const tickets = await Ticket.find({ customerId })
                                 .sort({ createdAt: -1 });
    return tickets;  // Returns ALL tickets across all business types
}
```

**Impact:**
- `get_ticket_information` function returns tickets from ALL presets
- Customer who used both luxfree and ecommerce sees mixed results
- Agent dashboard shows unrelated tickets

---

### 3. **No Preset Validation in Ticket Operations**

**Problem:**
```javascript
// No check if the ticket belongs to the active business type
async updateTicket(ticketId, updates) {
    // ❌ Luxfree agent could update ecommerce ticket
    return await Ticket.findByIdAndUpdate(ticketId, updates);
}
```

**Impact:**
- Preset A users can modify Preset B tickets
- Category updates could bypass validation
- Status changes could use wrong terminology

---

## 🛡️ Recommended Implementation

### Phase 1: Add Business Type Field (Database Migration)

**1.1 Update Ticket Model**

```javascript
// src/models/Ticket.js
const ticketSchema = new mongoose.Schema({
    // ... existing fields ...
    
    // NEW: Business type isolation
    businessType: {
        type: String,
        required: true,
        enum: ['luxfree', 'restaurant', 'ecommerce', 'healthcare', 'custom'],
        index: true,
        default: function() {
            // Auto-detect from category or default to luxfree
            return 'luxfree';
        }
    },
    
    // Optional: Store full preset config snapshot for audit
    presetSnapshot: {
        presetId: String,
        assistantName: String,
        companyName: String
    }
});

// Compound index for efficient queries
ticketSchema.index({ customerId: 1, businessType: 1 });
ticketSchema.index({ businessType: 1, status: 1 });
```

**1.2 Migration Script**

```javascript
// scripts/migrate-add-business-type.js
const Ticket = require('../src/models/Ticket');
const configService = require('../src/services/configurationService');

async function migrateExistingTickets() {
    const presets = await configService.getConfigurationPresets();
    
    // Map categories to business types
    const categoryMap = {};
    presets.forEach(preset => {
        preset.config.ticket_categories.forEach(cat => {
            categoryMap[cat.id] = preset.id;
        });
    });
    
    // Update all existing tickets
    const tickets = await Ticket.find({});
    
    for (const ticket of tickets) {
        const businessType = categoryMap[ticket.category] || 'luxfree';
        ticket.businessType = businessType;
        
        // Store preset snapshot
        const preset = presets.find(p => p.id === businessType);
        if (preset) {
            ticket.presetSnapshot = {
                presetId: preset.id,
                assistantName: preset.config.assistant_configuration.assistantName,
                companyName: preset.config.assistant_configuration.companyName
            };
        }
        
        await ticket.save();
        console.log(`Updated ticket ${ticket.ticketId} → ${businessType}`);
    }
    
    console.log(`✅ Migrated ${tickets.length} tickets`);
}

migrateExistingTickets().catch(console.error);
```

---

### Phase 2: Add Business Type Validation in Services

**2.1 Update Ticket Service**

```javascript
// src/services/ticketService.js
class TicketService {
    /**
     * Get active business type from configuration
     */
    async getActiveBusinessType() {
        const assistantConfig = await configService.getAssistantConfig();
        return assistantConfig.presetId || 'luxfree';
    }
    
    /**
     * Validate ticket belongs to active business type
     */
    async validateBusinessType(ticket) {
        const activeBusinessType = await this.getActiveBusinessType();
        
        if (ticket.businessType !== activeBusinessType) {
            throw new Error(
                `Ticket ${ticket.ticketId} belongs to ${ticket.businessType} ` +
                `but current business type is ${activeBusinessType}`
            );
        }
        
        return true;
    }
    
    /**
     * Create ticket (UPDATED with business type)
     */
    async createTicketFromAI(data) {
        const businessType = await this.getActiveBusinessType();
        
        // Validate category belongs to current business
        const isValidCategory = await this.validateCategory(data.category);
        if (!isValidCategory) {
            throw new Error('Invalid category for current business type');
        }
        
        const ticketId = await this.generateTicketId();
        
        const ticket = new Ticket({
            ...data,
            ticketId,
            businessType,  // ✅ Store business type
            presetSnapshot: {
                presetId: businessType,
                assistantName: assistantConfig.assistantName,
                companyName: assistantConfig.companyName
            }
        });
        
        await ticket.save();
        return ticket;
    }
    
    /**
     * Get tickets by customer (UPDATED with business filter)
     */
    async getTicketsByCustomer(customerId, options = {}) {
        const businessType = await this.getActiveBusinessType();
        
        const query = {
            customerId,
            businessType  // ✅ Only return tickets for active business
        };
        
        if (options.status) query.status = options.status;
        if (options.excludeStatus) query.status = { $ne: options.excludeStatus };
        
        const tickets = await Ticket.find(query)
            .sort({ createdAt: -1 })
            .limit(options.limit || 20);
        
        return {
            tickets,
            total: await Ticket.countDocuments(query),
            businessType  // Include in response for debugging
        };
    }
    
    /**
     * Update ticket (UPDATED with business validation)
     */
    async updateTicket(ticketId, updates, agentId) {
        const ticket = await this.findTicketByAnyId(ticketId);
        
        if (!ticket) {
            throw new Error('Ticket not found');
        }
        
        // ✅ Validate ticket belongs to current business
        await this.validateBusinessType(ticket);
        
        // Prevent changing businessType
        if (updates.businessType && updates.businessType !== ticket.businessType) {
            throw new Error('Cannot change ticket business type');
        }
        
        Object.assign(ticket, updates);
        await ticket.save();
        
        return ticket;
    }
}
```

**2.2 Update OpenAI Tool Handler**

```javascript
// src/services/openaiService.js (in handleToolCalls function)

// BEFORE calling get_ticket_information
if (functionName === "get_ticket_information") {
    const businessType = await configService.getAssistantConfig()
                                            .then(c => c.presetId || 'luxfree');
    
    // Pass business type to ticket service
    const result = await ticketService.getTicketInformation(
        args,
        businessType  // ✅ Filter by business type
    );
    
    output = JSON.stringify(result);
}
```

---

### Phase 3: Add Business Type Guards in Frontend

**3.1 Update Agent Dashboard**

```typescript
// frontend/src/app/services/chat.ts
export class ChatService {
    loadConversations() {
        // Add business type filter
        const businessType = this.getCurrentBusinessType();
        
        return this.http.get(`/api/v2/conversations`, {
            params: { businessType }  // ✅ Filter by business type
        });
    }
    
    private getCurrentBusinessType(): string {
        // Get from settings or localStorage
        return localStorage.getItem('activeBusinessType') || 'luxfree';
    }
}
```

**3.2 Add Business Type Indicator in UI**

```html
<!-- frontend/src/app/components/chat/chat.component.html -->
<div class="business-indicator">
    <span class="badge badge-{{businessType}}">
        {{ businessTypeName }}
    </span>
</div>
```

---

## 🔒 Security Checklist

Before going to production, ensure:

- [ ] `businessType` field added to Ticket model with index
- [ ] All existing tickets migrated with correct businessType
- [ ] `getTicketsByCustomer()` filters by businessType
- [ ] `updateTicket()` validates businessType before modifications
- [ ] `createTicketFromAI()` stores businessType from active preset
- [ ] E-commerce functions still check preset compatibility
- [ ] Frontend filters conversations by businessType
- [ ] Agent permissions respect business type boundaries
- [ ] Ticket reopening checks businessType hasn't changed
- [ ] Reporting/analytics respect business type isolation

---

## 🧪 Testing Plan

### Test Case 1: Cross-Business Isolation
```javascript
// 1. Set preset to luxfree
// 2. Create ticket "LUX-2026-000001" (solar_installation)
// 3. Switch preset to ecommerce
// 4. Try to query ticket by customer
// Expected: Ticket NOT returned (different businessType)
```

### Test Case 2: Business Type Immutability
```javascript
// 1. Create luxfree ticket
// 2. Try to update businessType to 'ecommerce'
// Expected: Error thrown, update rejected
```

### Test Case 3: E-commerce Functions Still Protected
```javascript
// 1. Set preset to luxfree
// 2. Try to call get_ecommerce_order
// Expected: "Integration disabled" error
```

### Test Case 4: Category Validation
```javascript
// 1. Set preset to luxfree
// 2. Try to create ticket with category 'product_inquiry' (ecommerce category)
// Expected: "Invalid category" error
```

---

## 📊 Migration Impact

**Estimated Downtime:** 0 minutes (backward compatible)

**Database Changes:**
- Add `businessType` field (default: 'luxfree')
- Add `presetSnapshot` field (optional)
- Add compound indexes

**Breaking Changes:** None (field has default value)

**Rollback Plan:** 
```javascript
// Remove businessType field if needed
db.tickets.updateMany({}, { $unset: { businessType: "", presetSnapshot: "" } });
```

---

## 🎯 Implementation Priority

### High Priority (Must Have)
1. Add `businessType` field to Ticket model
2. Update `getTicketsByCustomer()` with businessType filter
3. Update `createTicketFromAI()` to store businessType
4. Run migration script for existing tickets

### Medium Priority (Should Have)
5. Add businessType validation in `updateTicket()`
6. Add businessType guards in ticket reopening
7. Update frontend to show business type indicator

### Low Priority (Nice to Have)
8. Store full preset snapshot for audit trail
9. Add business type analytics
10. Add cross-business ticket migration tool

---

## 📝 Summary

**Current State:** E-commerce functions are protected, but tickets lack business type isolation.

**Recommended Solution:** Add `businessType` field to tickets and filter all queries by active preset.

**Benefits:**
- Complete isolation between luxfree, ecommerce, restaurant, healthcare
- No cross-contamination of tickets
- Supports multi-business use cases
- Maintains audit trail with preset snapshots

**Implementation Time:** ~4 hours (model update + migration + service updates + testing)
