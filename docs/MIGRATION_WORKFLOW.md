# Step-by-Step Migration Workflow for NestJS

## Phase 1: Setup and Preparation

### 1.1 Copy Reference Files
In your new NestJS project, create a reference folder and copy your existing code:

```bash
# In your new NestJS project root
mkdir -p reference/original-code
cd reference/original-code

# Copy your entire Express.js src folder
cp -r /path/to/your/express-project/src ./
cp /path/to/your/express-project/package.json ./
cp /path/to/your/express-project/.env.example ./
```

### 1.2 Install Required Dependencies
```bash
# Back to NestJS project root
cd ../..

# Install all required dependencies
npm install @nestjs/mongoose @nestjs/websockets @nestjs/platform-socket.io 
npm install @nestjs/config @nestjs/swagger @nestjs/jwt @nestjs/passport 
npm install @nestjs/throttler mongoose socket.io axios node-fetch 
npm install swagger-ui-express class-validator class-transformer 
npm install passport passport-jwt bcryptjs dotenv
```

### 1.3 Create Environment Configuration
```bash
# Copy your existing .env but adapt for NestJS structure
cp reference/original-code/.env.example .env
```

## Phase 2: Database Module Migration

### 2.1 Generate Database Module
```bash
nest generate module database
nest generate service database
```

### 2.2 Copilot Prompt for Database Module
**Open the reference file:** `reference/original-code/database/config.js`

**Then use this prompt with Copilot:**
```
I have an existing Express.js MongoDB connection configuration in the reference file. Please create a NestJS database module with:

1. MongoDB connection using @nestjs/mongoose
2. Configuration service integration
3. The same connection settings and error handling
4. Export the database module for use in other modules

Reference the connection logic from the original config.js file and convert it to NestJS patterns.
```

### 2.3 Generate Entity (UserThread Migration)
```bash
nest generate class database/entities/user-thread --no-spec
```

**Copilot Prompt:**
```
Looking at reference/original-code/models/UserThread.js, create a Mongoose schema using @nestjs/mongoose decorators with:

1. All the same fields and types
2. Proper indexes
3. Timestamps
4. Validation rules
5. NestJS entity patterns

Convert the Mongoose model to use NestJS schema decorators while maintaining the exact same data structure.
```

## Phase 3: Core Services Migration

### 3.1 Generate OpenAI Module
```bash
nest generate module modules/openai
nest generate service modules/openai
```

**Copilot Prompt for OpenAI Service:**
```
I need to migrate the OpenAI service from reference/original-code/services/openaiService.js to NestJS.

Create a NestJS service that includes:

1. All the same methods (getAIResponse, cleanupUserThread, etc.)
2. Dependency injection for ConfigService and UserThread model
3. The same thread management logic with in-memory cache + MongoDB persistence
4. Tool calling functionality for ticket creation
5. Message cleanup with the same thresholds (10 messages, cleanup at 15)
6. Proper error handling and logging
7. TypeScript interfaces for better type safety

Maintain the exact same OpenAI Assistant integration logic while converting to NestJS patterns.
```

### 3.2 Generate WhatsApp Service
```bash
nest generate service modules/whatsapp
```

**Copilot Prompt:**
```
Looking at reference/original-code/services/whatsappService.js, create a NestJS service with:

1. All WhatsApp API integration methods
2. Message sending functionality
3. Media URL retrieval
4. Typing indicators
5. Template message support
6. Same HTTP client configuration using axios
7. Proper error handling and retry logic
8. ConfigService injection for API credentials

Convert the service while maintaining all the WhatsApp Cloud API functionality.
```

## Phase 4: Controllers Migration

### 4.1 Generate WhatsApp Controller
```bash
nest generate controller modules/whatsapp
```

**Copilot Prompt:**
```
I need to migrate reference/original-code/controllers/whatsappController.js to a NestJS controller.

Create a controller with:

1. All the same endpoints (verifyToken, receivedMessage, sendTemplateData, cleanupUserThread)
2. Proper decorators (@Get, @Post, @Body, @Query)
3. DTO validation for request bodies
4. Integration with WhatsApp and OpenAI services
5. WebSocket integration for real-time events
6. The same message type handling (text, image, location, interactive)
7. Swagger API documentation decorators
8. Same response formats

Reference the exact logic from the original controller but convert to NestJS patterns.
```

### 4.2 Create DTOs
```bash
nest generate class modules/whatsapp/dto/webhook --no-spec
nest generate class modules/whatsapp/dto/send-message --no-spec
```

**Copilot Prompt:**
```
Based on the request/response structures in reference/original-code/controllers/whatsappController.js, create validation DTOs using class-validator decorators for:

1. WhatsApp webhook payload validation
2. Send message request validation
3. Thread cleanup request validation

Include proper validation rules, types, and Swagger documentation.
```

## Phase 5: WebSocket Migration

### 5.1 Generate WebSocket Gateway
```bash
nest generate gateway modules/websocket/websocket
```

**Copilot Prompt:**
```
Looking at reference/original-code/services/socket.js and how Socket.io is used in server.js, create a NestJS WebSocket gateway with:

1. Same CORS configuration
2. Connection/disconnection handling
3. Room management for conversations
4. Event handling for incoming messages
5. Broadcasting capabilities
6. Integration with WhatsApp webhook events
7. Real-time message updates

Convert the Socket.io setup to NestJS WebSocket gateway patterns while maintaining the same real-time functionality.
```

## Phase 6: Utilities and Helpers Migration

### 6.1 Create Utilities
```bash
mkdir -p src/utils
```

**Copilot Prompt:**
```
Convert the following utility files to TypeScript modules:

1. reference/original-code/shared/processMessage.js → src/utils/message-processor.ts
2. reference/original-code/shared/helpers.js → src/utils/helpers.ts  
3. reference/original-code/shared/constants.js → src/utils/constants.ts
4. reference/original-code/shared/whatsappModels.js → src/utils/whatsapp-models.ts

Maintain all the same functions and logic but with proper TypeScript types and exports.
```

## Phase 7: Main App Configuration

### 7.1 Configure main.ts
**Copilot Prompt:**
```
Looking at reference/original-code/models/server.js, configure my NestJS main.ts with:

1. Same CORS settings
2. Same security headers
3. Same body parser limits (20mb)
4. Global validation pipe
5. Swagger setup
6. Same port configuration
7. Global prefix '/api/v2'

Convert the Express.js server configuration to NestJS bootstrap patterns.
```

### 7.2 Configure app.module.ts
**Copilot Prompt:**
```
Create the main app module that imports all the modules I've created and configures:

1. ConfigModule for environment variables
2. DatabaseModule for MongoDB connection
3. ThrottlerModule for rate limiting
4. All feature modules (WhatsApp, OpenAI, WebSocket)
5. Global pipes and filters

Structure it like the original server.js but with NestJS module patterns.
```

## Phase 8: Testing and Validation

### 8.1 Test Each Module
Create test scripts to validate each migrated module:

```bash
# Test database connection
npm run start:dev
# Check MongoDB connection in logs

# Test WhatsApp webhook
curl -X GET "http://localhost:3000/api/v2?hub.verify_token=your_token&hub.challenge=test"

# Test OpenAI integration (create a simple test endpoint)
```

### 8.2 Environment Variables Validation
**Create a validation script:**
```typescript
// src/config/env.validation.ts
// Validate all required environment variables are present
```

## Phase 9: Additional Services Migration

### 9.1 Media Services
```bash
nest generate service modules/media/cloudinary
nest generate service modules/location/geocoding
```

**Copilot Prompts:**
```
1. Convert reference/original-code/services/cloudinaryService.js to NestJS service
2. Convert reference/original-code/services/geocodingService.js to NestJS service

Maintain same functionality with proper DI and TypeScript.
```

## Copilot Workflow Tips

### For Each Module Migration:
1. **Open the reference file first** in VS Code
2. **Create the new NestJS file** (controller, service, etc.)
3. **Use the specific prompt** provided above
4. **Review and test** the generated code
5. **Refine with follow-up prompts** if needed

### Example Follow-up Prompts:
```
"Add proper error handling to this service"
"Add TypeScript interfaces for better type safety"  
"Add Swagger documentation to these endpoints"
"Add validation to this DTO"
"Add logging to this service method"
```

### Testing Each Module:
```
"Create a simple test to verify this service works correctly"
"Help me test this controller endpoint with curl commands"
"Create a unit test for this service method"
```

## Migration Checklist

- [ ] Database module with UserThread entity
- [ ] OpenAI service with thread management
- [ ] WhatsApp service with API integration  
- [ ] WhatsApp controller with all endpoints
- [ ] WebSocket gateway with real-time events
- [ ] Utilities and helpers migration
- [ ] Main app configuration
- [ ] Environment variables setup
- [ ] Media services (Cloudinary, Geocoding)
- [ ] Testing and validation
- [ ] Documentation update

## Validation Steps

After each module:
1. **Compile check**: `npm run build`
2. **Start server**: `npm run start:dev` 
3. **Test specific functionality**
4. **Check logs for errors**
5. **Test with actual WhatsApp webhook**

This approach gives you the best of both worlds: proper NestJS architecture with complete functionality preservation!