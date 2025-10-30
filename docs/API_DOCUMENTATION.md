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

This documentation provides everything the Angular frontend team needs to integrate with your WhatsApp CRM API effectively.