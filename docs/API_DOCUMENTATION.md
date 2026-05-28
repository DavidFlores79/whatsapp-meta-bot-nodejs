# API Documentation for Angular Frontend Integration

## Base URL
```
Development: http://localhost:5000/api/v2
Production: https://your-domain.com/api/v2
```

## Authentication

### JWT Token Structure
```json
{
  "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
  "refreshToken": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
  "expiresIn": 3600,
  "agent": {
    "id": "507f1f77bcf86cd799439011",
    "email": "agent@company.com",
    "firstName": "John",
    "lastName": "Doe",
    "role": "agent",
    "permissions": ["read:conversations", "write:messages"]
  }
}
```

### Headers Required
```javascript
Authorization: Bearer <jwt_token>
Content-Type: application/json
```

## Socket.io Integration

### Connection Setup
```typescript
import { io, Socket } from 'socket.io-client';

const socket: Socket = io('http://localhost:5000', {
  auth: {
    token: localStorage.getItem('jwt_token')
  }
});
```

### Real-time Events

#### Incoming Events (Listen)
```typescript
// New message received from WhatsApp
socket.on('conversation:new_message', (data) => {
  console.log('New message:', data);
  /*
  {
    conversationId: "507f1f77bcf86cd799439011",
    message: {
      id: "msg_123",
      content: "Hello, I need help",
      type: "text",
      direction: "inbound",
      timestamp: "2025-10-30T10:30:00Z",
      status: "delivered"
    },
    customer: {
      phoneNumber: "529991234567",
      firstName: "Juan",
      lastName: "Pérez"
    }
  }
  */
});

// Conversation assigned to agent
socket.on('conversation:assigned', (data) => {
  /*
  {
    conversationId: "507f1f77bcf86cd799439011",
    assignedAgent: {
      id: "507f1f77bcf86cd799439022",
      firstName: "Maria",
      lastName: "García"
    },
    assignedBy: "507f1f77bcf86cd799439033"
  }
  */
});

// Agent status change
socket.on('agent:status_change', (data) => {
  /*
  {
    agentId: "507f1f77bcf86cd799439011",
    status: "online", // online, offline, busy, away
    lastSeen: "2025-10-30T10:30:00Z"
  }
  */
});

// Customer typing indicator
socket.on('customer:typing', (data) => {
  /*
  {
    conversationId: "507f1f77bcf86cd799439011",
    customerPhone: "529991234567",
    isTyping: true
  }
  */
});

// Message status update
socket.on('message:status_update', (data) => {
  /*
  {
    messageId: "msg_123",
    status: "read", // sent, delivered, read, failed
    timestamp: "2025-10-30T10:30:00Z"
  }
  */
});
```

#### Outgoing Events (Emit)
```typescript
// Join conversation room for real-time updates
socket.emit('join:conversation', {
  conversationId: "507f1f77bcf86cd799439011"
});

// Leave conversation room
socket.emit('leave:conversation', {
  conversationId: "507f1f77bcf86cd799439011"
});

// Agent typing indicator
socket.emit('agent:typing', {
  conversationId: "507f1f77bcf86cd799439011",
  isTyping: true
});

// Update agent status
socket.emit('agent:status', {
  status: "busy"
});
```

## REST API Endpoints

### Authentication Endpoints

#### POST /auth/login
```typescript
// Request
{
  email: string;
  password: string;
}

// Response
{
  success: boolean;
  token: string;
  refreshToken: string;
  expiresIn: number;
  agent: Agent;
}
```

#### POST /auth/refresh
```typescript
// Request
{
  refreshToken: string;
}

// Response
{
  token: string;
  expiresIn: number;
}
```

### Customer Endpoints

#### GET /customers
```typescript
// Query Parameters
interface CustomerListParams {
  page?: number;          // Default: 1
  limit?: number;         // Default: 20, Max: 100
  search?: string;        // Search in name, phone, email
  tags?: string[];        // Filter by tags
  sortBy?: 'name' | 'lastInteraction' | 'createdAt';
  sortOrder?: 'asc' | 'desc';
}

// Response
interface CustomerListResponse {
  customers: Customer[];
  pagination: {
    currentPage: number;
    totalPages: number;
    totalCount: number;
    hasNext: boolean;
    hasPrev: boolean;
  };
}
```

#### GET /customers/:phoneNumber
```typescript
// Response
interface Customer {
  _id: string;
  phoneNumber: string;
  firstName?: string;
  lastName?: string;
  email?: string;
  avatar?: string;
  tags: string[];
  notes?: string;
  isBlocked: boolean;
  customFields: Record<string, any>;
  lastInteraction: string;
  totalConversations: number;
  createdAt: string;
  updatedAt: string;
}
```

### Conversation Endpoints

#### GET /conversations
```typescript
// Query Parameters
interface ConversationListParams {
  page?: number;
  limit?: number;
  status?: 'open' | 'assigned' | 'resolved' | 'closed';
  assignedAgent?: string;  // Agent ID
  priority?: 'low' | 'medium' | 'high' | 'urgent';
  tags?: string[];
  search?: string;
  dateFrom?: string;       // ISO date string
  dateTo?: string;         // ISO date string
}

// Response
interface ConversationListResponse {
  conversations: Conversation[];
  pagination: PaginationInfo;
}

interface Conversation {
  _id: string;
  customer: {
    _id: string;
    phoneNumber: string;
    firstName?: string;
    lastName?: string;
    avatar?: string;
  };
  assignedAgent?: {
    _id: string;
    firstName: string;
    lastName: string;
    avatar?: string;
  };
  status: 'open' | 'assigned' | 'resolved' | 'closed';
  priority: 'low' | 'medium' | 'high' | 'urgent';
  tags: string[];
  lastMessage: {
    content: string;
    timestamp: string;
    from: 'customer' | 'agent' | 'system';
    type: 'text' | 'image' | 'location' | 'document';
  };
  messageCount: number;
  unreadCount: number;
  isAIEnabled: boolean;
  createdAt: string;
  updatedAt: string;
}
```

#### GET /conversations/:conversationId/messages
```typescript
// Query Parameters
interface MessageListParams {
  page?: number;
  limit?: number;        // Default: 50, Max: 100
  before?: string;       // Load messages before this message ID
  after?: string;        // Load messages after this message ID
}

// Response
interface MessageListResponse {
  messages: Message[];
  pagination: PaginationInfo;
  hasMore: boolean;
}

interface Message {
  _id: string;
  conversationId: string;
  content: string;
  type: 'text' | 'image' | 'location' | 'document' | 'template';
  direction: 'inbound' | 'outbound';
  status: 'sent' | 'delivered' | 'read' | 'failed';
  whatsappMessageId?: string;
  agent?: {
    _id: string;
    firstName: string;
    lastName: string;
  };
  attachments?: Array<{
    type: string;
    url: string;
    filename: string;
    size: number;
  }>;
  location?: {
    latitude: number;
    longitude: number;
    address: string;
  };
  metadata: Record<string, any>;
  timestamp: string;
}
```

#### POST /conversations/:conversationId/messages
```typescript
// Request
interface SendMessageRequest {
  content: string;
  type?: 'text' | 'template';
  templateName?: string;    // For template messages
  templateParams?: string[]; // Template parameters
}

// Response
interface SendMessageResponse {
  success: boolean;
  message: Message;
  whatsappResponse?: any;   // WhatsApp API response
}
```

#### POST /conversations/:conversationId/assign
```typescript
// Request
{
  agentId: string;
  note?: string;    // Optional assignment note
}

// Response
{
  success: boolean;
  conversation: Conversation;
}
```

#### PUT /conversations/:conversationId/status
```typescript
// Request
{
  status: 'open' | 'assigned' | 'resolved' | 'closed';
  note?: string;
}

// Response
{
  success: boolean;
  conversation: Conversation;
}
```

### Ticket Endpoints

#### GET /tickets
```typescript
// Query Parameters
interface TicketListParams {
  page?: number;
  limit?: number;
  status?: 'open' | 'in_progress' | 'resolved' | 'closed';
  priority?: 'low' | 'medium' | 'high' | 'urgent';
  category?: string;
  assignedAgent?: string;
  customerId?: string;
  search?: string;
  dateFrom?: string;
  dateTo?: string;
}

// Response
interface TicketListResponse {
  tickets: Ticket[];
  pagination: PaginationInfo;
}

interface Ticket {
  _id: string;
  ticketId: string;          // Human-readable ID like TICKET-001
  customer: {
    _id: string;
    phoneNumber: string;
    firstName?: string;
    lastName?: string;
  };
  conversation?: {
    _id: string;
  };
  assignedAgent?: {
    _id: string;
    firstName: string;
    lastName: string;
  };
  subject: string;
  description: string;
  category: string;
  priority: 'low' | 'medium' | 'high' | 'urgent';
  status: 'open' | 'in_progress' | 'resolved' | 'closed';
  attachments: string[];      // URLs to files
  location?: {
    latitude: number;
    longitude: number;
    address: string;
  };
  estimatedResolution?: string;
  resolvedAt?: string;
  notes: Array<{
    _id: string;
    agent: {
      _id: string;
      firstName: string;
      lastName: string;
    };
    content: string;
    timestamp: string;
    isInternal: boolean;
  }>;
  createdAt: string;
  updatedAt: string;
}
```

#### GET /tickets/statistics
```typescript
// Response
interface TicketStatistics {
  byStatus: {
    new: number;
    open: number;
    in_progress: number;
    pending_customer: number;
    waiting_internal: number;
    resolved: number;
    closed: number;
  };
  byCategory: Record<string, number>;
  byPriority: {
    low: number;
    medium: number;
    high: number;
    urgent: number;
  };
  byAgent: Array<{
    agentId: string;
    agentName: string;
    count: number;
  }>;
  averageResolutionTime: number; // in hours
  total: number;
}
```

#### GET /tickets/:id
```typescript
// Response
interface TicketDetailResponse {
  success: boolean;
  ticket: Ticket;
}
```

#### POST /tickets
```typescript
// Request
interface CreateTicketRequest {
  customerId: string;
  conversationId?: string;
  subject: string;
  description: string;
  category: string;
  priority?: 'low' | 'medium' | 'high' | 'urgent';
  assignedAgent?: string;
  location?: {
    latitude: number;
    longitude: number;
    address?: string;
  };
  attachments?: string[]; // URLs
}

// Response
interface CreateTicketResponse {
  success: boolean;
  ticket: Ticket;
}
```

#### PUT /tickets/:id/status
```typescript
// Request
interface UpdateTicketStatusRequest {
  status: 'new' | 'open' | 'in_progress' | 'pending_customer' | 'waiting_internal' | 'resolved' | 'closed';
  reason?: string;
  resolutionSummary?: string; // Required when status = 'resolved'
}

// Response
interface UpdateTicketStatusResponse {
  success: boolean;
  ticket: Ticket;
  notificationSent?: boolean; // True if WhatsApp notification sent to customer
}
```

#### PUT /tickets/:id/assign
```typescript
// Request
interface AssignTicketRequest {
  agentId: string;
  note?: string;
}

// Response
interface AssignTicketResponse {
  success: boolean;
  ticket: Ticket;
}
```

#### POST /tickets/:id/notes
```typescript
// Request
interface AddTicketNoteRequest {
  content: string;
  isInternal: boolean; // True = agent-only, False = visible to customer
}

// Response
interface AddTicketNoteResponse {
  success: boolean;
  note: {
    _id: string;
    agent: { _id: string; firstName: string; lastName: string };
    content: string;
    timestamp: string;
    isInternal: boolean;
  };
}
```

#### PUT /tickets/:id/resolve
```typescript
// Request
interface ResolveTicketRequest {
  resolutionSummary: string;
  sendNotification?: boolean; // Default: true
}

// Response
interface ResolveTicketResponse {
  success: boolean;
  ticket: Ticket;
  notificationSent: boolean;
}

// Note: Automatically sends WhatsApp notification to customer
// Customer can respond within 48 hours to auto-reopen ticket
```

#### PUT /tickets/:id/escalate
```typescript
// Request
interface EscalateTicketRequest {
  reason: string;
  targetAgent?: string; // Specific agent to escalate to
}

// Response
interface EscalateTicketResponse {
  success: boolean;
  ticket: Ticket;
}
```

#### GET /customers/:customerId/tickets
```typescript
// Query Parameters
interface CustomerTicketsParams {
  status?: string;
  limit?: number;
}

// Response
interface CustomerTicketsResponse {
  success: boolean;
  tickets: Ticket[];
  total: number;
}
```

#### GET /conversations/:conversationId/tickets
```typescript
// Response
interface ConversationTicketsResponse {
  success: boolean;
  tickets: Ticket[];
  total: number;
}
```

### Configuration Endpoints (Admin Only)

#### GET /config/ticket-categories
```typescript
// Response
interface TicketCategoriesResponse {
  success: boolean;
  categories: Array<{
    id: string;
    label: string;
    labelEn: string;
    icon: string;
    color: string;
    description: string;
  }>;
}
```

#### PUT /config/ticket-categories
```typescript
// Request
interface UpdateCategoriesRequest {
  categories: Array<{
    id: string;
    label: string;
    labelEn: string;
    icon: string;
    color: string;
    description: string;
  }>;
}

// Response
interface UpdateCategoriesResponse {
  success: boolean;
  message: string;
}
```

#### GET /config/assistant
```typescript
// Response
interface AssistantConfigResponse {
  success: boolean;
  config: {
    assistantName: string;
    companyName: string;
    primaryServiceIssue: string;
    serviceType: string;
    ticketNoun: string;
    ticketNounPlural: string;
    language: string;
  };
}
```

#### GET /config/presets
```typescript
// Response
interface PresetsResponse {
  success: boolean;
  presets: Array<{
    id: string;
    name: string;
    description: string;
    industry: string;
  }>;
}
```

#### POST /config/presets/load
```typescript
// Request
interface LoadPresetRequest {
  presetId: 'luxfree' | 'restaurant' | 'ecommerce' | 'healthcare';
}

// Response
interface LoadPresetResponse {
  success: boolean;
  message: string;
  appliedConfig: {
    categories: any[];
    terminology: any;
    ticketIdFormat: any;
    assistantConfig: any;
  };
}
```

### Analytics Endpoints

#### GET /analytics/dashboard
```typescript
// Response
interface DashboardStats {
  conversations: {
    total: number;
    open: number;
    assigned: number;
    resolved: number;
    todayCount: number;
  };
  messages: {
    totalToday: number;
    averageResponseTime: number;  // in minutes
    responseRate: number;         // percentage
  };
  tickets: {
    total: number;
    open: number;
    resolved: number;
    averageResolutionTime: number; // in hours
  };
  agents: {
    online: number;
    busy: number;
    total: number;
  };
  charts: {
    conversationsOverTime: Array<{
      date: string;
      count: number;
    }>;
    responseTimesByHour: Array<{
      hour: number;
      averageTime: number;
    }>;
  };
}
```

## Error Handling

### Standard Error Response
```typescript
interface ErrorResponse {
  success: false;
  error: {
    code: string;           // Error code for programmatic handling
    message: string;        // Human-readable error message
    details?: any;          // Additional error details
    field?: string;         // Field that caused validation error
  };
  timestamp: string;
  path: string;            // API endpoint that caused error
}
```

### Common Error Codes
```typescript
// Authentication errors
'AUTH_TOKEN_EXPIRED'        // JWT token expired
'AUTH_TOKEN_INVALID'        // Invalid JWT token
'AUTH_CREDENTIALS_INVALID'  // Wrong email/password
'AUTH_INSUFFICIENT_PERMISSIONS' // User lacks required permissions

// Validation errors
'VALIDATION_FAILED'         // Request validation failed
'PHONE_NUMBER_INVALID'      // Invalid phone number format
'EMAIL_INVALID'            // Invalid email format

// Resource errors
'RESOURCE_NOT_FOUND'       // Requested resource not found
'CONVERSATION_NOT_FOUND'   // Conversation doesn't exist
'CUSTOMER_NOT_FOUND'       // Customer doesn't exist
'DUPLICATE_RESOURCE'       // Resource already exists

// Business logic errors
'CONVERSATION_ALREADY_ASSIGNED' // Conversation already assigned to agent
'AGENT_UNAVAILABLE'        // Agent is offline or busy
'MESSAGE_SEND_FAILED'      // WhatsApp message failed to send

// System errors
'INTERNAL_SERVER_ERROR'    // Generic server error
'DATABASE_ERROR'           // Database operation failed
'EXTERNAL_API_ERROR'       // WhatsApp API error
```

## File Upload

### POST /upload
```typescript
// Request (multipart/form-data)
FormData with 'file' field

// Response
{
  success: boolean;
  url: string;           // Cloudinary URL
  publicId: string;      // Cloudinary public ID
  format: string;        // File format
  size: number;          // File size in bytes
}
```

### Supported File Types
- Images: jpg, jpeg, png, gif, webp (max 10MB)
- Documents: pdf, doc, docx, txt (max 25MB)
- Audio: mp3, m4a, ogg (max 16MB)

## Rate Limiting

### Default Limits
- Authentication endpoints: 5 requests per minute
- Message sending: 10 requests per minute
- File upload: 5 requests per minute
- Other endpoints: 100 requests per minute

### Rate Limit Headers
```
X-RateLimit-Limit: 100
X-RateLimit-Remaining: 95
X-RateLimit-Reset: 1635724800
```

## Pagination

### Standard Pagination Format
```typescript
interface PaginationInfo {
  currentPage: number;
  totalPages: number;
  totalCount: number;
  pageSize: number;
  hasNext: boolean;
  hasPrev: boolean;
}
```

### Query Parameters
- `page`: Page number (1-based, default: 1)
- `limit`: Items per page (default: 20, max: 100)

## Environment Variables for Frontend

```typescript
// Angular environment files
export const environment = {
  production: false,
  apiUrl: 'http://localhost:5000/api/v2',
  socketUrl: 'http://localhost:5000',
  uploadUrl: 'http://localhost:5000/api/v2/upload',
  maxFileSize: 25 * 1024 * 1024, // 25MB
  supportedImageFormats: ['jpg', 'jpeg', 'png', 'gif', 'webp'],
  supportedDocumentFormats: ['pdf', 'doc', 'docx', 'txt'],
  jwtTokenKey: 'whatsapp_crm_token',
  refreshTokenKey: 'whatsapp_crm_refresh_token'
};
```

## TypeScript Interfaces

### Create shared interface file for Angular project
```typescript
// src/app/core/models/api.types.ts
export interface Agent {
  _id: string;
  email: string;
  firstName: string;
  lastName: string;
  role: 'admin' | 'supervisor' | 'agent';
  status: 'online' | 'offline' | 'busy' | 'away';
  avatar?: string;
  lastLogin?: string;
  isActive: boolean;
  permissions: string[];
  assignedConversations: string[];
  createdAt: string;
  updatedAt: string;
}

export interface Customer {
  _id: string;
  phoneNumber: string;
  firstName?: string;
  lastName?: string;
  email?: string;
  avatar?: string;
  tags: string[];
  notes?: string;
  isBlocked: boolean;
  customFields: Record<string, any>;
  lastInteraction: string;
  totalConversations: number;
  createdAt: string;
  updatedAt: string;
}

export interface Conversation {
  _id: string;
  customer: Customer;
  assignedAgent?: Agent;
  status: 'open' | 'assigned' | 'resolved' | 'closed';
  priority: 'low' | 'medium' | 'high' | 'urgent';
  tags: string[];
  lastMessage: {
    content: string;
    timestamp: string;
    from: 'customer' | 'agent' | 'system';
    type: 'text' | 'image' | 'location' | 'document';
  };
  messageCount: number;
  unreadCount: number;
  isAIEnabled: boolean;
  metadata: Record<string, any>;
  createdAt: string;
  updatedAt: string;
  resolvedAt?: string;
}

export interface Message {
  _id: string;
  conversationId: string;
  content: string;
  type: 'text' | 'image' | 'location' | 'document' | 'template';
  direction: 'inbound' | 'outbound';
  status: 'sent' | 'delivered' | 'read' | 'failed';
  whatsappMessageId?: string;
  agent?: {
    _id: string;
    firstName: string;
    lastName: string;
  };
  attachments?: Array<{
    type: string;
    url: string;
    filename: string;
    size: number;
  }>;
  location?: {
    latitude: number;
    longitude: number;
    address: string;
  };
  metadata: Record<string, any>;
  timestamp: string;
}

export interface Ticket {
  _id: string;
  ticketId: string;
  customer: Customer;
  conversation?: { _id: string };
  assignedAgent?: Agent;
  subject: string;
  description: string;
  category: string;
  priority: 'low' | 'medium' | 'high' | 'urgent';
  status: 'open' | 'in_progress' | 'resolved' | 'closed';
  attachments: string[];
  location?: {
    latitude: number;
    longitude: number;
    address: string;
  };
  estimatedResolution?: string;
  resolvedAt?: string;
  notes: Array<{
    _id: string;
    agent: Agent;
    content: string;
    timestamp: string;
    isInternal: boolean;
  }>;
  createdAt: string;
  updatedAt: string;
}

// API Response types
export interface ApiResponse<T> {
  success: boolean;
  data?: T;
  error?: {
    code: string;
    message: string;
    details?: any;
    field?: string;
  };
  timestamp: string;
  path: string;
}

export interface PaginatedResponse<T> {
  items: T[];
  pagination: {
    currentPage: number;
    totalPages: number;
    totalCount: number;
    pageSize: number;
    hasNext: boolean;
    hasPrev: boolean;
  };
}
```

---

## 🎫 Tickets API

### Get Tickets
```http
GET /api/v2/tickets
Authorization: Bearer <token>
```

**Query Parameters:**
```javascript
{
  page: 1,
  limit: 20,
  status: 'open',  // open, in_progress, resolved, closed
  category: 'product_defect',
  priority: 'high',
  assignedAgent: '507f1f77bcf86cd799439011'
}
```

**Response:**
```json
{
  "success": true,
  "tickets": [{
    "_id": "507f1f77bcf86cd799439011",
    "ticketId": "ORD-2026-00456",
    "businessType": "ecommerce",
    "customerId": {
      "_id": "507f1f77bcf86cd799439012",
      "firstName": "Giovanni",
      "lastName": "Rossi",
      "phoneNumber": "529991234567"
    },
    "subject": "Defective product in order #ORD-2026-00123",
    "description": "Package damaged, product leaked",
    "category": "product_defect",
    "priority": "high",
    "status": "open",
    "createdAt": "2026-01-11T10:00:00Z",
    "updatedAt": "2026-01-11T10:00:00Z"
  }],
  "total": 45,
  "page": 1,
  "pages": 3
}
```

### Get Ticket by ID
```http
GET /api/v2/tickets/:ticketId
Authorization: Bearer <token>
```

**Response:**
```json
{
  "success": true,
  "ticket": {
    "_id": "507f1f77bcf86cd799439011",
    "ticketId": "ORD-2026-00456",
    "businessType": "ecommerce",
    "customerId": { /* full customer object */ },
    "assignedAgent": { /* full agent object */ },
    "subject": "Defective product in order #ORD-2026-00123",
    "description": "Package damaged, product leaked",
    "category": "product_defect",
    "priority": "high",
    "status": "in_progress",
    "attachments": [{
      "type": "image",
      "url": "https://res.cloudinary.com/...",
      "filename": "damaged_product.jpg"
    }],
    "notes": [{
      "_id": "507f1f77bcf86cd799439013",
      "agent": {
        "_id": "507f1f77bcf86cd799439014",
        "firstName": "Maria",
        "lastName": "García"
      },
      "content": "Replacement order created",
      "isInternal": false,
      "timestamp": "2026-01-11T11:00:00Z"
    }],
    "resolution": {
      "summary": "Replacement order sent",
      "resolvedBy": "507f1f77bcf86cd799439014",
      "resolvedAt": "2026-01-11T12:00:00Z"
    },
    "createdAt": "2026-01-11T10:00:00Z",
    "updatedAt": "2026-01-11T12:00:00Z"
  }
}
```

### Update Ticket Status
```http
PATCH /api/v2/tickets/:ticketId/status
Authorization: Bearer <token>
Content-Type: application/json
```

**Request:**
```json
{
  "status": "resolved",
  "reason": "Replacement order shipped"
}
```

**Response:**
```json
{
  "success": true,
  "ticket": { /* updated ticket */ }
}
```

### Add Ticket Note
```http
POST /api/v2/tickets/:ticketId/notes
Authorization: Bearer <token>
Content-Type: application/json
```

**Request:**
```json
{
  "content": "Customer confirmed receipt of replacement",
  "isInternal": false
}
```

**Response:**
```json
{
  "success": true,
  "ticket": { /* ticket with new note */ }
}
```

### Resolve Ticket
```http
POST /api/v2/tickets/:ticketId/resolve
Authorization: Bearer <token>
Content-Type: application/json
```

**Request:**
```json
{
  "resolution": {
    "summary": "Sent replacement product via express shipping",
    "steps": [
      "Verified defective product via photos",
      "Created replacement order #ORD-2026-00124",
      "Applied express shipping at no cost"
    ],
    "category": "solved"
  }
}
```

---

## 🛒 E-commerce Integration (AI Functions Only)

**Note:** E-commerce features are only available through the AI Assistant when the **ecommerce preset** is active. These are not direct API endpoints but AI function calls.

### AI Function: search_ecommerce_products

**Triggered by customer requests like:**
- "Show me pasta products"
- "Do you have gluten-free options?"
- "What Italian products are available?"

**Function Call:**
```javascript
{
  function: "search_ecommerce_products",
  arguments: {
    query: "pasta",
    limit: 10
  }
}
```

**Response to AI:**
```json
{
  "success": true,
  "products": [{
    "product_id": "507f1f77bcf86cd799439011",
    "name": "Spaghetti Barilla 500g",
    "price": 2.50,
    "currency": "USD",
    "stock": 45,
    "description": "Premium Italian pasta",
    "image_url": "https://cdn.example.com/pasta.jpg"
  }],
  "total": 25
}
```

### AI Function: create_ecommerce_order

**Triggered after customer confirms order**

**Function Call:**
```javascript
{
  function: "create_ecommerce_order",
  arguments: {
    customer_phone: "529991234567",
    customer_name: "Giovanni Rossi",
    customer_email: "giovanni@example.com",
    items: [{
      product_id: "507f1f77bcf86cd799439011",
      product_name: "Spaghetti Barilla 500g",
      quantity: 2,
      unit_price: 2.50
    }],
    shipping_address: {
      street: "123 Main Street",
      city: "Rome",
      state: "Lazio",
      postal_code: "00100",
      country: "Italy"
    },
    payment_method: "cash_on_delivery",
    notes: "Please ring doorbell twice"
  }
}
```

**Response to AI:**
```json
{
  "success": true,
  "order": {
    "order_id": "ORD-2026-00123",
    "order_number": "LBI-20260111-00123",
    "status": "pending",
    "total": 8.80,
    "estimated_delivery": "2026-01-15",
    "tracking_url": "https://track.example.com/ORD-2026-00123",
    "items": [{
      "product_name": "Spaghetti Barilla 500g",
      "quantity": 2,
      "unit_price": 2.50,
      "subtotal": 5.00
    }],
    "shipping_cost": 3.00,
    "tax": 0.80
  }
}
```

### AI Function: get_ecommerce_order

**Triggered by customer requests like:**
- "Where's my order #ORD-2026-00123?"
- "Check order status"

**Function Call:**
```javascript
{
  function: "get_ecommerce_order",
  arguments: {
    search_type: "order_id",  // or "phone", "email"
    search_value: "ORD-2026-00123",
    include_items: true
  }
}
```

**Response to AI:**
```json
{
  "success": true,
  "found": true,
  "orders": [{
    "order_id": "ORD-2026-00123",
    "order_number": "LBI-20260111-00123",
    "status": "in_transit",
    "total": 8.80,
    "order_date": "2026-01-11",
    "estimated_delivery": "2026-01-15",
    "tracking_number": "TRACK123456",
    "items": [{
      "product_name": "Spaghetti Barilla 500g",
      "quantity": 2,
      "unit_price": 2.50
    }],
    "timeline": [
      { "status": "pending", "timestamp": "2026-01-11T10:00:00Z" },
      { "status": "confirmed", "timestamp": "2026-01-11T10:30:00Z" },
      { "status": "shipped", "timestamp": "2026-01-12T09:00:00Z" },
      { "status": "in_transit", "timestamp": "2026-01-13T08:00:00Z" }
    ]
  }]
}
```

### AI Function: get_active_orders

**Triggered by customer requests like:**
- "Show my recent orders"
- "What orders do I have?"

**Function Call:**
```javascript
{
  function: "get_active_orders",
  arguments: {
    customer_phone: "529991234567"
  }
}
```

**Response to AI:**
```json
{
  "success": true,
  "orders": [{
    "order_id": "ORD-2026-00123",
    "status": "in_transit",
    "total": 8.80,
    "order_date": "2026-01-11",
    "item_count": 1
  }, {
    "order_id": "ORD-2026-00098",
    "status": "delivered",
    "total": 15.50,
    "order_date": "2026-01-05",
    "item_count": 3
  }],
  "total": 2
}
```

---

## 🔔 Socket.io Events for Tickets

### ticket_created
```typescript
socket.on('ticket_created', (data) => {
  /*
  {
    ticket: { /* full ticket object */ },
    customerId: "507f1f77bcf86cd799439012"
  }
  */
});
```

### ticket_status_changed
```typescript
socket.on('ticket_status_changed', (data) => {
  /*
  {
    ticket: { /* full ticket object */ },
    previousStatus: "open"
  }
  */
});
```

### ticket_assigned
```typescript
socket.on('ticket_assigned', (data) => {
  /*
  {
    ticketId: "ORD-2026-00456",
    agentId: "507f1f77bcf86cd799439014",
    ticket: { /* full ticket object */ }
  }
  */
});
```

### ticket_note_added
```typescript
socket.on('ticket_note_added', (data) => {
  /*
  {
    ticket: { /* full ticket object */ },
    note: {
      _id: "507f1f77bcf86cd799439015",
      content: "Replacement shipped",
      timestamp: "2026-01-11T12:00:00Z"
    }
  }
  */
});
```

### ticket_resolved
```typescript
socket.on('ticket_resolved', (data) => {
  /*
  {
    ticket: { /* full ticket object with resolution */ }
  }
  */
});
```

### ticket_reopened
```typescript
socket.on('ticket_reopened', (data) => {
  /*
  {
    ticket: { /* full ticket object */ },
    previousStatus: "resolved",
    reopenCount: 1
  }
  */
});
```

---

## 📚 Additional Resources

- [E-commerce Workflow Guide](ECOMMERCE_WORKFLOW.md) - Complete guide for orders and tickets
- [Business Type Isolation](BUSINESS_TYPE_ISOLATION.md) - Multi-preset architecture
- [Configuration Presets](../src/services/configurationService.js) - Preset management

---

This documentation provides everything the Angular frontend team needs to integrate with your WhatsApp CRM API effectively, including the new ticket system and e-commerce integration features.
