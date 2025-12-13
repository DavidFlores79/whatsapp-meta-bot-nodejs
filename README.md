# WhatsApp Meta Bot with AI & CRM System

A complete WhatsApp business solution combining AI-powered conversation management with a full-featured CRM system. Built with Node.js, Express, MongoDB, Angular, and OpenAI Assistant API.

## ✨ Key Features

### 🤖 AI-Powered Conversations
- **OpenAI Assistant Integration** - Intelligent responses with per-user context preservation
- **Thread Management** - Automatic conversation history with memory optimization
- **Token Optimization** - 70%+ cost reduction through smart context cleanup
- **Concurrent Request Protection** - Race condition prevention and message ordering

### 💼 Complete CRM System
- **Customer Management** - Full CRUD operations with tags, notes, and status tracking
- **Agent Portal** - Role-based authentication (Admin, Supervisor, Agent)
- **Conversation History** - Complete chat logs with WhatsApp integration
- **Template Management** - Create, sync, and send WhatsApp message templates
- **Bulk Operations** - Import/Export customers (XLSX, XLS, CSV)
- **Real-time Updates** - Socket.io integration for live notifications

### 📱 WhatsApp Cloud API Integration
- **Webhook Processing** - Fast response (<100ms) preventing timeouts
- **Message Deduplication** - Eliminates duplicate responses (30-50% cost savings)
- **Burst Detection** - Combines rapid messages for coherent AI responses
- **Multimedia Support** - Images (Cloudinary) and location (Google Maps)
- **Interactive Messages** - Buttons, lists, and quick replies

### 🔧 Production-Ready
- **Health Monitoring** - `/health`, `/health/ready`, `/health/live` endpoints
- **Security** - JWT authentication, role-based authorization, rate limiting
- **Deployment Scripts** - PowerShell (Windows) and Bash (Linux) automation
- **Error Handling** - Comprehensive logging and graceful error recovery

## Quick Start

### Prerequisites
- Node.js >= 22.0.0
- MongoDB instance
- WhatsApp Cloud API credentials

### Installation

```bash
npm install
```

### Environment Setup

Create a `.env` file with the following variables:

```env
# Server Configuration
PORT=5000
MONGODB=your_mongodb_connection_string
NODE_ENV=production

# WhatsApp Cloud API
WHATSAPP_URI=graph.facebook.com
WHATSAPP_VERSION=v20.0
WHATSAPP_PHONE_NUMBER_ID=your_phone_number_id
WHATSAPP_API_TOKEN=your_api_token
WHATSAPP_ACCESS_TOKEN=your_access_token
WHATSAPP_ADMIN=admin_phone_number

# OpenAI Assistant
OPENAI_API_KEY=your_openai_api_key
OPENAI_ASSISTANT_ID=your_openai_assistant_id

# Cloudinary (Image Storage)
CLOUDINARY_CLOUD_NAME=your_cloud_name
CLOUDINARY_API_KEY=your_api_key
**Production:**
```bash
npm start
```

**Build Frontend:**
```bash
npm run build
```

**Create Admin User:**
```bash
npm run create-admin
```

**Reset Admin Password:**
```bash
npm run reset-admin
```

## Deployment
# JWT Authentication
JWT_SECRET=your_jwt_secret_key
JWT_EXPIRES_IN=24h

# Security
RATE_LIMIT_MAX=100
RATE_LIMIT_WINDOW_MS=900000
```

### Running the Application

**Development:**
```bash
npm run dev
```

**Production:**
```bash
npm start
```

## Deployment

```
src/
├── app.js                         # Application entry point
├── controllers/                   # Request handlers
│   ├── whatsappController.js      # WhatsApp webhook handlers
│   ├── customerController.js      # Customer CRUD operations
│   ├── agentController.js         # Agent management & auth
│   ├── conversationController.js  # Chat history
│   ├── templateController.js      # WhatsApp templates
│   ├── crmSettingsController.js   # CRM configuration
│   └── healthController.js        # Health checks
├── models/                        # MongoDB schemas
│   ├── server.js                  # Express server setup
│   ├── Customer.js                # Customer data model
│   ├── Agent.js                   # Agent/user model
│   ├── Conversation.js            # Chat message history
│   ├── Template.js                # WhatsApp templates
│   ├── UserThread.js              # OpenAI thread tracking
│   └── CRMSettings.js             # System settings
├── routes/                        # API endpoints
│   ├── whatsappRoutes.js          # /api/v2 (webhooks)
│   ├── customerRoutes.js          # /api/v2/customers
│   ├── agentRoutes.js             # /api/v2/agents
│   ├── conversationRoutes.js      # /api/v2/conversations
│   ├── templateRoutes.js          # /api/v2/templates
│   ├── crmSettingsRoutes.js       # /api/v2/crm-settings
│   └── healthRoutes.js            # /health
├── services/                      # Business logic
│   ├── openaiService.js           # OpenAI Assistant integration
│   ├── whatsappService.js         # WhatsApp Cloud API client
│   ├── cloudinaryService.js       # Image storage
│   ├── geocodingService.js        # Location services
│   ├── queueService.js            # Message burst detection
│   ├── deduplicationService.js    # Duplicate prevention
│   └── socket.js                  # Real-time updates
├── handlers/                      # Message processors
## API Endpoints

### WhatsApp Integration
- `GET /api/v2/` - WhatsApp webhook verification
- `POST /api/v2/` - WhatsApp webhook message receiver
- `POST /api/v2/send` - Send template messages
## Documentation

- [API Documentation](docs/API_DOCUMENTATION.md) - Complete API reference
- [Deployment Guide](DEPLOYMENT_GUIDE.md) - Step-by-step deployment instructions
- [Customer Import/Export](docs/CUSTOMER_IMPORT_EXPORT_GUIDE.md) - Bulk operations guide
- [Database Schema](docs/DATABASE_SCHEMA.md) - MongoDB schema documentation
- [Thread Optimization](docs/THREAD_OPTIMIZATION.md) - OpenAI context management
- [CRM Implementation](docs/CRM_IMPLEMENTATION_PLAN.md) - CRM system architecture
- [Frontend Guide](docs/CRM_FRONTEND_GUIDE.md) - Angular frontend documentation
- [Testing Guide](docs/TESTING_GUIDE.md) - Testing strategies and examples

## Technology Stack

### Backend
- **Node.js** (22.x) with Express.js
- **MongoDB** for data persistence
- **Socket.io** for real-time communication
- **OpenAI Assistant API** for AI conversations
- **WhatsApp Cloud API** (v20.0) for messaging
- **Cloudinary** for image storage
- **Google Maps API** for geocoding
- **JWT** for authentication

### Frontend
- **Angular** (21.x) with TypeScript
- **TailwindCSS** for styling
- **ngx-translate** for i18n
- **RxJS** for reactive programming
- **Socket.io-client** for real-time updates
- `PUT /api/v2/customers/:id` - Update customer
- `DELETE /api/v2/customers/:id` - Delete customer
- `PATCH /api/v2/customers/:id/block` - Block/unblock customer
- `GET /api/v2/customers/stats/summary` - Customer statistics
- `GET /api/v2/customers/export` - Export customers (XLSX/CSV)
- `POST /api/v2/customers/bulk/import` - Import customers
- `GET /api/v2/customers/:id/conversations` - Customer chat history

### Agent Management
- `GET /api/v2/agents` - List agents (admin only)
- `GET /api/v2/agents/:id` - Get agent details
- `POST /api/v2/agents` - Create agent (admin only)
- `PUT /api/v2/agents/:id` - Update agent
- `DELETE /api/v2/agents/:id` - Delete agent (admin only)
- `PATCH /api/v2/agents/:id/role` - Change agent role (admin only)

### Conversations
- `GET /api/v2/conversations` - List conversations (paginated)
- `GET /api/v2/conversations/:id` - Get conversation details
- `GET /api/v2/conversations/stats/summary` - Conversation statistics

### Templates
- `GET /api/v2/templates` - List templates
- `GET /api/v2/templates/:id` - Get template details
- `POST /api/v2/templates/sync` - Sync from WhatsApp API
- `POST /api/v2/templates/send` - Send to single customer
- `POST /api/v2/templates/send-bulk` - Send to multiple customers
- `PUT /api/v2/templates/:id` - Update template
- `DELETE /api/v2/templates/:id` - Delete template

### Health & Monitoring
- `GET /health` - Full health check with dependency status
- `GET /health/ready` - Readiness probe (for load balancers)
- `GET /health/live` - Liveness probe (for container orchestration)
- `GET /info` - Service information and statistics
│   ├── whatsappModels.js          # Message builders
│   ├── processMessage.js          # Phone formatting, text analysis
│   ├── helpers.js                 # General utilities
│   └── constants.js               # App constants
└── database/
    └── config.js                  # MongoDB connection

frontend/                          # Angular CRM Frontend
├── src/app/
│   ├── components/
│   │   ├── auth/                  # Login & authentication
│   │   ├── customers/             # Customer management UI
│   │   ├── agents/                # Agent management UI
│   │   ├── chat/                  # Conversation viewer
│   │   ├── templates/             # Template manager
│   │   ├── reports/               # Analytics & reports
│   │   └── settings/              # CRM settings
│   ├── services/                  # API clients
console.log(`In-memory: ${counts.inMemory}, Database: ${counts.database}`);
```

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md) for guidelines on how to contribute to this project.

## Changelog

See [CHANGELOG.md](CHANGELOG.md) for a detailed list of changes, improvements, and bug fixes.

## License

ISC

## Support

For issues, questions, or feature requests, please open an issue on GitHub.

---

**Version:** 1.0.0  
**Last Updated:** December 2025 routes/
│   └── whatsappRoutes.js    # API routes (/api/v2)
├── services/
│   ├── whatsappService.js   # WhatsApp Cloud API integration
│   └── socket.js            # Socket.io configuration
├── shared/
│   ├── whatsappModels.js    # Message builders
│   ├── processMessage.js    # Message processing utilities
│   ├── helpers.js           # Helper functions
│   └── constants.js         # Application constants
└── database/
    └── config.js            # MongoDB configuration
```

## API Endpoints

- `GET /api/v2/` - WhatsApp webhook verification
- `POST /api/v2/` - WhatsApp webhook message receiver
 - `POST /api/v2/send` - Send template messages

## Features

- WhatsApp webhook verification and message processing
- AI-powered responses using OpenAI Assistant (text messages)
- Interactive message support (buttons, lists)
- Template message sending
- File upload handling
- Socket.io integration for real-time updates
- Custom logging system
- **CRM System** with customer management
- **Customer Import/Export** (XLSX, XLS, CSV) - See [Import/Export Guide](docs/CUSTOMER_IMPORT_EXPORT_GUIDE.md)

## OpenAI Assistant Integration

Text messages sent to the bot are processed by OpenAI Assistant for AI-powered responses. **Context is preserved per user** - each user has their own conversation thread that persists across messages and server restarts.

Configure your OpenAI API key and Assistant ID in the environment variables:

- `OPENAI_API_KEY`: Your OpenAI API key
- `OPENAI_ASSISTANT_ID`: The Assistant ID to use for responses

### Context Management

- **Per-User Threads**: Each user gets a dedicated OpenAI thread that maintains conversation history
- **Dual Storage**: Threads are cached in memory for performance and persisted in MongoDB for reliability
- **Automatic Recovery**: If the server restarts, user contexts are automatically restored from the database
- **Message Count Tracking**: Each user's interaction count is tracked in the database

You can manage contexts programmatically:
```javascript
const openaiService = require('./src/services/openaiService');

// Clear a specific user's context
await openaiService.clearUserContext('529991234567');

// Clear all user contexts
await openaiService.clearAllContexts();

// Get active users count
const counts = await openaiService.getActiveUsersCount();
console.log(`In-memory: ${counts.inMemory}, Database: ${counts.database}`);
```

## License

ISC