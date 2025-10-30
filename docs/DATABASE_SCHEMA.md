# Database Schema Design for WhatsApp CRM

## Overview
This document outlines the MongoDB database schema design for transforming the WhatsApp bot into a full CRM system. The design maintains the existing functionality while adding comprehensive customer and conversation management capabilities.

## Existing Schema (Keep & Modify)

### UserThread (Rename to ConversationThread)
```javascript
// Current schema - to be renamed and enhanced
{
  _id: ObjectId,
  userId: String,           // Phone number (keep for backward compatibility)
  threadId: String,         // OpenAI thread ID
  messageCount: Number,
  lastInteraction: Date,
  lastCleanup: Date,
  createdAt: Date,
  updatedAt: Date
}

// Enhanced schema
{
  _id: ObjectId,
  conversationId: ObjectId,  // Reference to Conversation collection
  customerId: ObjectId,      // Reference to Customer collection
  userId: String,            // Phone number (keep for backward compatibility)
  threadId: String,          // OpenAI thread ID
  messageCount: Number,
  lastInteraction: Date,
  lastCleanup: Date,
  isActive: Boolean,         // Whether thread is currently active
  createdAt: Date,
  updatedAt: Date
}
```

## New Database Collections

### 1. Agent Collection
```javascript
{
  _id: ObjectId,
  email: {
    type: String,
    required: true,
    unique: true,
    lowercase: true
  },
  password: {
    type: String,
    required: true        // Hashed with bcrypt
  },
  firstName: {
    type: String,
    required: true,
    maxlength: 50
  },
  lastName: {
    type: String,
    required: true,
    maxlength: 50
  },
  role: {
    type: String,
    enum: ['admin', 'supervisor', 'agent'],
    default: 'agent'
  },
  status: {
    type: String,
    enum: ['online', 'offline', 'busy', 'away'],
    default: 'offline'
  },
  avatar: String,           // URL to profile image
  phone: String,
  department: String,
  permissions: [{
    type: String,
    enum: [
      'read:conversations',
      'write:messages', 
      'assign:conversations',
      'manage:customers',
      'manage:tickets',
      'view:analytics',
      'manage:agents',
      'system:admin'
    ]
  }],
  preferences: {
    language: { type: String, default: 'es' },
    timezone: { type: String, default: 'America/Mexico_City' },
    notifications: {
      email: { type: Boolean, default: true },
      push: { type: Boolean, default: true },
      sound: { type: Boolean, default: true }
    },
    autoAssignment: { type: Boolean, default: true }
  },
  statistics: {
    totalConversations: { type: Number, default: 0 },
    resolvedConversations: { type: Number, default: 0 },
    averageResponseTime: { type: Number, default: 0 }, // in minutes
    currentActiveConversations: { type: Number, default: 0 }
  },
  lastLogin: Date,
  lastActivity: Date,
  isActive: { type: Boolean, default: true },
  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now }
}

// Indexes
db.agents.createIndex({ email: 1 }, { unique: true })
db.agents.createIndex({ status: 1 })
db.agents.createIndex({ role: 1 })
db.agents.createIndex({ isActive: 1 })
```

### 2. Customer Collection
```javascript
{
  _id: ObjectId,
  phoneNumber: {
    type: String,
    required: true,
    unique: true,
    index: true
  },
  firstName: String,
  lastName: String,
  email: {
    type: String,
    lowercase: true
  },
  avatar: String,           // URL to profile image
  
  // Contact Information
  alternativePhones: [String],
  address: {
    street: String,
    city: String,
    state: String,
    country: { type: String, default: 'México' },
    postalCode: String,
    coordinates: {
      latitude: Number,
      longitude: Number
    }
  },
  
  // Customer Segmentation
  tags: [String],           // Custom tags for segmentation
  segment: {
    type: String,
    enum: ['vip', 'regular', 'new', 'inactive'],
    default: 'new'
  },
  source: {
    type: String,
    enum: ['whatsapp', 'referral', 'website', 'social_media', 'other'],
    default: 'whatsapp'
  },
  
  // Custom fields for business-specific data
  customFields: {
    type: Map,
    of: String              // Flexible key-value pairs
  },
  
  // Behavioral Data
  preferences: {
    language: { type: String, default: 'es' },
    communicationHours: {
      start: { type: String, default: '09:00' },
      end: { type: String, default: '18:00' }
    },
    preferredAgent: ObjectId  // Reference to Agent
  },
  
  // Status and Notes
  status: {
    type: String,
    enum: ['active', 'inactive', 'blocked', 'vip'],
    default: 'active'
  },
  isBlocked: { type: Boolean, default: false },
  blockReason: String,
  notes: String,            // Internal notes about customer
  
  // Statistics
  statistics: {
    totalConversations: { type: Number, default: 0 },
    totalMessages: { type: Number, default: 0 },
    totalTickets: { type: Number, default: 0 },
    averageResponseTime: { type: Number, default: 0 }, // Customer's avg response time
    satisfactionScore: { type: Number, min: 1, max: 5 } // Average satisfaction rating
  },
  
  // Timestamps
  firstContact: Date,
  lastInteraction: Date,
  lastMessageAt: Date,
  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now }
}

// Indexes
db.customers.createIndex({ phoneNumber: 1 }, { unique: true })
db.customers.createIndex({ email: 1 })
db.customers.createIndex({ tags: 1 })
db.customers.createIndex({ segment: 1 })
db.customers.createIndex({ status: 1 })
db.customers.createIndex({ lastInteraction: -1 })
db.customers.createIndex({ 
  firstName: "text", 
  lastName: "text", 
  phoneNumber: "text", 
  email: "text" 
})
```

### 3. Conversation Collection
```javascript
{
  _id: ObjectId,
  customerId: {
    type: ObjectId,
    ref: 'Customer',
    required: true,
    index: true
  },
  
  // Assignment
  assignedAgent: {
    type: ObjectId,
    ref: 'Agent',
    index: true
  },
  assignedAt: Date,
  assignedBy: {
    type: ObjectId,
    ref: 'Agent'
  },
  
  // Status Management
  status: {
    type: String,
    enum: ['open', 'assigned', 'waiting', 'resolved', 'closed'],
    default: 'open',
    index: true
  },
  priority: {
    type: String,
    enum: ['low', 'medium', 'high', 'urgent'],
    default: 'medium',
    index: true
  },
  
  // Categorization
  category: {
    type: String,
    enum: ['support', 'sales', 'billing', 'technical', 'complaint', 'other'],
    default: 'support'
  },
  tags: [String],
  
  // AI and Automation
  isAIEnabled: { type: Boolean, default: true },
  aiModel: { type: String, default: 'gpt-4' },
  autoResponses: { type: Boolean, default: true },
  
  // Conversation Metadata
  channel: {
    type: String,
    enum: ['whatsapp', 'web', 'mobile_app'],
    default: 'whatsapp'
  },
  source: String,           // How conversation was initiated
  
  // Message Statistics
  messageCount: { type: Number, default: 0 },
  unreadCount: { type: Number, default: 0 },
  lastMessage: {
    content: String,
    timestamp: Date,
    from: {
      type: String,
      enum: ['customer', 'agent', 'system']
    },
    type: {
      type: String,
      enum: ['text', 'image', 'location', 'document', 'template']
    }
  },
  
  // Response Time Tracking
  firstResponseTime: Number,    // Minutes to first agent response
  averageResponseTime: Number,  // Average agent response time
  lastAgentResponse: Date,
  lastCustomerMessage: Date,
  
  // Resolution
  resolvedAt: Date,
  resolvedBy: {
    type: ObjectId,
    ref: 'Agent'
  },
  resolutionNotes: String,
  customerSatisfaction: {
    rating: { type: Number, min: 1, max: 5 },
    comment: String,
    submittedAt: Date
  },
  
  // Internal Notes
  internalNotes: [{
    agent: { type: ObjectId, ref: 'Agent' },
    content: String,
    timestamp: { type: Date, default: Date.now },
    isVisible: { type: Boolean, default: false } // Visible to customer
  }],
  
  // Integration Data
  whatsappData: {
    phoneNumberId: String,
    businessAccountId: String
  },
  
  // Timestamps
  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now },
  closedAt: Date
}

// Indexes
db.conversations.createIndex({ customerId: 1 })
db.conversations.createIndex({ assignedAgent: 1 })
db.conversations.createIndex({ status: 1 })
db.conversations.createIndex({ priority: 1 })
db.conversations.createIndex({ category: 1 })
db.conversations.createIndex({ createdAt: -1 })
db.conversations.createIndex({ updatedAt: -1 })
db.conversations.createIndex({ tags: 1 })
db.conversations.createIndex({ 
  status: 1, 
  assignedAgent: 1 
})
```

### 4. Message Collection
```javascript
{
  _id: ObjectId,
  conversationId: {
    type: ObjectId,
    ref: 'Conversation',
    required: true,
    index: true
  },
  customerId: {
    type: ObjectId,
    ref: 'Customer',
    required: true,
    index: true
  },
  
  // Message Content
  content: {
    type: String,
    required: true
  },
  type: {
    type: String,
    enum: ['text', 'image', 'audio', 'video', 'document', 'location', 'contact', 'template', 'interactive'],
    default: 'text',
    index: true
  },
  
  // Direction and Source
  direction: {
    type: String,
    enum: ['inbound', 'outbound'],
    required: true,
    index: true
  },
  sender: {
    type: String,
    enum: ['customer', 'agent', 'system', 'ai'],
    required: true
  },
  agentId: {
    type: ObjectId,
    ref: 'Agent'
  },
  
  // WhatsApp Integration
  whatsappMessageId: String,    // WhatsApp's message ID
  whatsappStatus: {
    type: String,
    enum: ['sent', 'delivered', 'read', 'failed'],
    default: 'sent'
  },
  whatsappTimestamp: Date,
  whatsappError: String,        // Error message if failed
  
  // Message Status
  status: {
    type: String,
    enum: ['pending', 'sent', 'delivered', 'read', 'failed'],
    default: 'pending',
    index: true
  },
  
  // Rich Media Content
  attachments: [{
    type: {
      type: String,
      enum: ['image', 'document', 'audio', 'video']
    },
    url: String,              // Cloudinary URL
    publicId: String,         // Cloudinary public ID
    filename: String,
    mimeType: String,
    size: Number,             // Size in bytes
    thumbnailUrl: String,     // For images/videos
    duration: Number          // For audio/video in seconds
  }],
  
  // Location Data
  location: {
    latitude: Number,
    longitude: Number,
    address: String,
    name: String              // Location name if provided
  },
  
  // Template Message Data
  template: {
    name: String,
    language: String,
    parameters: [String],
    category: String
  },
  
  // Interactive Message Data
  interactive: {
    type: {
      type: String,
      enum: ['button', 'list', 'quick_reply']
    },
    buttons: [{
      id: String,
      title: String,
      payload: String
    }],
    listItems: [{
      id: String,
      title: String,
      description: String
    }]
  },
  
  // AI Processing
  aiProcessed: { type: Boolean, default: false },
  aiResponse: {
    confidence: Number,
    intent: String,
    entities: [String],
    sentiment: {
      type: String,
      enum: ['positive', 'neutral', 'negative']
    }
  },
  
  // Message Context
  replyTo: {
    type: ObjectId,
    ref: 'Message'
  },
  isForwarded: { type: Boolean, default: false },
  forwardedFrom: String,
  
  // Timestamps
  timestamp: { type: Date, default: Date.now, index: true },
  readAt: Date,
  deliveredAt: Date,
  createdAt: { type: Date, default: Date.now }
}

// Indexes
db.messages.createIndex({ conversationId: 1, timestamp: -1 })
db.messages.createIndex({ customerId: 1, timestamp: -1 })
db.messages.createIndex({ direction: 1, timestamp: -1 })
db.messages.createIndex({ status: 1 })
db.messages.createIndex({ whatsappMessageId: 1 })
db.messages.createIndex({ type: 1 })
db.messages.createIndex({ 
  content: "text" 
}, {
  default_language: "spanish"
})
```

### 5. Ticket Collection (Enhanced)
```javascript
{
  _id: ObjectId,
  ticketId: {
    type: String,
    required: true,
    unique: true
  }, // Format: TICKET-YYYY-NNNNNN
  
  // Related Entities
  customerId: {
    type: ObjectId,
    ref: 'Customer',
    required: true,
    index: true
  },
  conversationId: {
    type: ObjectId,
    ref: 'Conversation',
    index: true
  },
  assignedAgent: {
    type: ObjectId,
    ref: 'Agent',
    index: true
  },
  
  // Ticket Information
  subject: {
    type: String,
    required: true,
    maxlength: 200
  },
  description: {
    type: String,
    required: true
  },
  
  // Classification
  category: {
    type: String,
    enum: [
      'technical_support', 
      'billing', 
      'product_inquiry', 
      'complaint', 
      'feature_request', 
      'bug_report',
      'general_inquiry',
      'other'
    ],
    required: true,
    index: true
  },
  subcategory: String,
  
  // Priority and Status
  priority: {
    type: String,
    enum: ['low', 'medium', 'high', 'urgent'],
    default: 'medium',
    index: true
  },
  status: {
    type: String,
    enum: ['open', 'in_progress', 'waiting_customer', 'waiting_internal', 'resolved', 'closed'],
    default: 'open',
    index: true
  },
  
  // SLA and Timing
  slaLevel: {
    type: String,
    enum: ['standard', 'priority', 'vip'],
    default: 'standard'
  },
  estimatedResolution: Date,
  firstResponseTime: Number,    // Minutes to first response
  resolutionTime: Number,       // Total minutes to resolve
  
  // Attachments and Media
  attachments: [{
    type: String,             // 'image', 'document', 'audio', 'video'
    url: String,              // Cloudinary URL
    publicId: String,         // Cloudinary public ID
    filename: String,
    size: Number,
    uploadedBy: { type: ObjectId, ref: 'Agent' },
    uploadedAt: { type: Date, default: Date.now }
  }],
  
  // Location Information
  location: {
    latitude: Number,
    longitude: Number,
    address: String,
    formattedAddress: String,
    isServiceLocation: { type: Boolean, default: false }
  },
  
  // Resolution Information
  resolution: {
    summary: String,
    steps: [String],
    resolvedBy: { type: ObjectId, ref: 'Agent' },
    resolvedAt: Date,
    resolutionCategory: {
      type: String,
      enum: ['solved', 'workaround', 'duplicate', 'invalid', 'wont_fix']
    }
  },
  
  // Customer Feedback
  customerFeedback: {
    rating: { type: Number, min: 1, max: 5 },
    comment: String,
    submittedAt: Date,
    followUpNeeded: { type: Boolean, default: false }
  },
  
  // Internal Notes and Communication
  notes: [{
    _id: { type: ObjectId, auto: true },
    agent: { type: ObjectId, ref: 'Agent', required: true },
    content: { type: String, required: true },
    isInternal: { type: Boolean, default: true },
    timestamp: { type: Date, default: Date.now },
    attachments: [String]     // URLs to attachments in this note
  }],
  
  // Tags and Labels
  tags: [String],
  labels: [{
    name: String,
    color: String             // Hex color code
  }],
  
  // Escalation
  escalated: { type: Boolean, default: false },
  escalatedTo: { type: ObjectId, ref: 'Agent' },
  escalatedAt: Date,
  escalationReason: String,
  
  // Related Tickets
  relatedTickets: [{ type: ObjectId, ref: 'Ticket' }],
  parentTicket: { type: ObjectId, ref: 'Ticket' },
  
  // Integration Data
  externalId: String,         // ID in external system
  externalUrl: String,        // URL to external system
  
  // Timestamps
  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now },
  closedAt: Date,
  lastActivityAt: { type: Date, default: Date.now }
}

// Indexes
db.tickets.createIndex({ ticketId: 1 }, { unique: true })
db.tickets.createIndex({ customerId: 1, createdAt: -1 })
db.tickets.createIndex({ assignedAgent: 1, status: 1 })
db.tickets.createIndex({ category: 1, status: 1 })
db.tickets.createIndex({ priority: 1, status: 1 })
db.tickets.createIndex({ createdAt: -1 })
db.tickets.createIndex({ status: 1, updatedAt: -1 })
db.tickets.createIndex({ tags: 1 })
db.tickets.createIndex({ 
  subject: "text", 
  description: "text" 
})
```

### 6. SystemSettings Collection
```javascript
{
  _id: ObjectId,
  key: {
    type: String,
    required: true,
    unique: true
  },
  value: {}, // Mixed type for flexibility
  description: String,
  category: {
    type: String,
    enum: ['general', 'whatsapp', 'ai', 'notifications', 'security', 'business'],
    default: 'general'
  },
  isEditable: { type: Boolean, default: true },
  updatedBy: { type: ObjectId, ref: 'Agent' },
  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now }
}

// Example settings
[
  {
    key: 'business_hours',
    value: {
      monday: { start: '09:00', end: '18:00', enabled: true },
      tuesday: { start: '09:00', end: '18:00', enabled: true },
      // ... other days
    },
    category: 'business'
  },
  {
    key: 'auto_assignment_enabled',
    value: true,
    category: 'general'
  },
  {
    key: 'max_conversations_per_agent',
    value: 10,
    category: 'general'
  },
  {
    key: 'ai_response_enabled',
    value: true,
    category: 'ai'
  }
]
```

### 7. ActivityLog Collection
```javascript
{
  _id: ObjectId,
  entityType: {
    type: String,
    enum: ['conversation', 'ticket', 'customer', 'agent', 'message'],
    required: true,
    index: true
  },
  entityId: {
    type: ObjectId,
    required: true,
    index: true
  },
  action: {
    type: String,
    enum: [
      'created', 'updated', 'deleted', 'assigned', 'transferred', 
      'resolved', 'closed', 'reopened', 'escalated', 'commented'
    ],
    required: true,
    index: true
  },
  performedBy: {
    type: ObjectId,
    ref: 'Agent',
    index: true
  },
  details: {
    before: {},           // State before change
    after: {},            // State after change
    changes: [String],    // List of changed fields
    reason: String        // Reason for change
  },
  ipAddress: String,
  userAgent: String,
  timestamp: { type: Date, default: Date.now, index: true }
}

// Indexes
db.activitylogs.createIndex({ entityType: 1, entityId: 1, timestamp: -1 })
db.activitylogs.createIndex({ performedBy: 1, timestamp: -1 })
db.activitylogs.createIndex({ action: 1, timestamp: -1 })
```

## Migration Strategy

### Phase 1: Create New Collections
1. Create all new collections with proper indexes
2. Set up default system settings
3. Create initial admin agent account

### Phase 2: Migrate Existing Data
```javascript
// Migration script to transform existing UserThread data
db.userthreads.find().forEach(function(thread) {
  // Create customer if doesn't exist
  let customer = db.customers.findOne({ phoneNumber: thread.userId });
  if (!customer) {
    customer = {
      _id: new ObjectId(),
      phoneNumber: thread.userId,
      firstContact: thread.createdAt,
      lastInteraction: thread.lastInteraction,
      statistics: {
        totalConversations: 1,
        totalMessages: thread.messageCount
      },
      createdAt: thread.createdAt,
      updatedAt: thread.updatedAt
    };
    db.customers.insertOne(customer);
  }
  
  // Create conversation
  const conversation = {
    _id: new ObjectId(),
    customerId: customer._id,
    status: 'open',
    messageCount: thread.messageCount,
    isAIEnabled: true,
    createdAt: thread.createdAt,
    updatedAt: thread.updatedAt
  };
  db.conversations.insertOne(conversation);
  
  // Update thread reference
  db.conversationthreads.insertOne({
    _id: thread._id,
    conversationId: conversation._id,
    customerId: customer._id,
    userId: thread.userId,
    threadId: thread.threadId,
    messageCount: thread.messageCount,
    lastInteraction: thread.lastInteraction,
    lastCleanup: thread.lastCleanup,
    isActive: true,
    createdAt: thread.createdAt,
    updatedAt: thread.updatedAt
  });
});

// Drop old collection after verification
// db.userthreads.drop();
```

### Phase 3: Update Application Code
1. Update models to use new schema
2. Modify controllers to work with new collections
3. Update OpenAI service to reference conversation IDs
4. Add data validation and business logic

## Performance Considerations

### Indexing Strategy
- Create compound indexes for common query patterns
- Use text indexes for search functionality
- Consider partial indexes for frequently filtered fields

### Data Archiving
```javascript
// Archive old conversations and messages
// Move conversations older than 1 year to archive collections
const archiveDate = new Date();
archiveDate.setFullYear(archiveDate.getFullYear() - 1);

// Archive conversations
db.conversations.find({ 
  status: 'closed', 
  closedAt: { $lt: archiveDate } 
}).forEach(function(conv) {
  db.conversations_archive.insertOne(conv);
  db.conversations.deleteOne({ _id: conv._id });
});

// Archive messages
db.messages.find({ 
  timestamp: { $lt: archiveDate } 
}).forEach(function(msg) {
  db.messages_archive.insertOne(msg);
  db.messages.deleteOne({ _id: msg._id });
});
```

### Query Optimization
- Use aggregation pipeline for complex queries
- Implement pagination for large result sets
- Cache frequently accessed data in Redis
- Use read replicas for analytics queries

## Data Relationships

### Entity Relationship Diagram
```
Customer (1) ←→ (N) Conversation ←→ (N) Message
Customer (1) ←→ (N) Ticket
Agent (1) ←→ (N) Conversation
Agent (1) ←→ (N) Ticket
Conversation (1) ←→ (1) ConversationThread
Conversation (1) ←→ (N) ActivityLog
Ticket (1) ←→ (N) ActivityLog
```

### Reference Management
- Use ObjectId references for relationships
- Implement cascade deletion where appropriate
- Add referential integrity checks in application logic
- Use MongoDB's `$lookup` for joins when needed

This schema design provides a solid foundation for a comprehensive WhatsApp CRM system while maintaining compatibility with your existing WhatsApp bot functionality.