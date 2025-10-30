# Migration Guide: Express.js WhatsApp Bot to NestJS

## Overview
This guide provides step-by-step instructions for migrating your current Express.js WhatsApp bot to NestJS while maintaining all existing functionality and preparing for CRM extensions.

## Why NestJS for This Project?

### Advantages for WhatsApp CRM System
- **Modular Architecture**: Perfect for CRM features (customers, conversations, tickets, agents)
- **Built-in TypeScript**: Better type safety and developer experience
- **Dependency Injection**: Easier testing and service management
- **Decorators**: Clean API endpoint definitions
- **Guards & Interceptors**: Better authentication and validation
- **WebSocket Integration**: Enhanced real-time features
- **Swagger Integration**: Automatic API documentation
- **Microservices Ready**: Easy to scale different components

## Current System Analysis

### Existing Express.js Structure
```
src/
├── app.js                          → app.module.ts (NestJS)
├── models/
│   ├── server.js                   → main.ts + app.module.ts
│   └── UserThread.js               → entities/user-thread.entity.ts
├── controllers/
│   └── whatsappController.js       → whatsapp/whatsapp.controller.ts
├── services/
│   ├── openaiService.js            → openai/openai.service.ts
│   ├── whatsappService.js          → whatsapp/whatsapp.service.ts
│   ├── cloudinaryService.js        → media/cloudinary.service.ts
│   ├── geocodingService.js         → location/geocoding.service.ts
│   └── socket.js                   → websocket/websocket.gateway.ts
├── routes/
│   └── whatsappRoutes.js           → Built into controllers with decorators
├── shared/
│   ├── constants.js                → constants/constants.ts
│   ├── helpers.js                  → utils/helpers.ts
│   ├── processMessage.js           → utils/message-processor.ts
│   └── whatsappModels.js           → dto/whatsapp-message.dto.ts
└── database/
    └── config.js                   → database/database.module.ts
```

## NestJS Project Setup

### 1. Create New NestJS Project
```bash
# Install NestJS CLI globally
npm i -g @nestjs/cli

# Create new project
nest new whatsapp-crm-nestjs

# Navigate to project
cd whatsapp-crm-nestjs

# Install required dependencies
npm install @nestjs/mongoose mongoose
npm install @nestjs/websockets @nestjs/platform-socket.io socket.io
npm install @nestjs/config
npm install axios node-fetch
npm install @nestjs/swagger swagger-ui-express
npm install class-validator class-transformer
npm install @nestjs/jwt @nestjs/passport passport passport-jwt
npm install bcryptjs
npm install @nestjs/throttler  # Rate limiting
```

### 2. Recommended NestJS Project Structure
```
src/
├── app.module.ts
├── main.ts
├── config/
│   ├── database.config.ts
│   ├── openai.config.ts
│   └── whatsapp.config.ts
├── common/
│   ├── decorators/
│   ├── filters/
│   ├── guards/
│   ├── interceptors/
│   ├── pipes/
│   └── constants/
├── database/
│   ├── database.module.ts
│   └── entities/
│       ├── user-thread.entity.ts
│       ├── agent.entity.ts
│       ├── customer.entity.ts
│       ├── conversation.entity.ts
│       ├── message.entity.ts
│       └── ticket.entity.ts
├── modules/
│   ├── auth/
│   │   ├── auth.module.ts
│   │   ├── auth.controller.ts
│   │   ├── auth.service.ts
│   │   ├── strategies/
│   │   │   └── jwt.strategy.ts
│   │   └── dto/
│   │       └── login.dto.ts
│   ├── whatsapp/
│   │   ├── whatsapp.module.ts
│   │   ├── whatsapp.controller.ts
│   │   ├── whatsapp.service.ts
│   │   └── dto/
│   │       ├── webhook.dto.ts
│   │       └── send-message.dto.ts
│   ├── openai/
│   │   ├── openai.module.ts
│   │   ├── openai.service.ts
│   │   └── dto/
│   │       └── ai-request.dto.ts
│   ├── websocket/
│   │   ├── websocket.module.ts
│   │   └── websocket.gateway.ts
│   ├── media/
│   │   ├── media.module.ts
│   │   ├── cloudinary.service.ts
│   │   └── dto/
│   │       └── upload.dto.ts
│   ├── customers/
│   │   ├── customers.module.ts
│   │   ├── customers.controller.ts
│   │   ├── customers.service.ts
│   │   └── dto/
│   ├── conversations/
│   │   ├── conversations.module.ts
│   │   ├── conversations.controller.ts
│   │   ├── conversations.service.ts
│   │   └── dto/
│   └── tickets/
│       ├── tickets.module.ts
│       ├── tickets.controller.ts
│       ├── tickets.service.ts
│       └── dto/
└── utils/
    ├── message-processor.ts
    └── helpers.ts
```

## Step-by-Step Migration Process

### Step 1: Core Configuration

#### main.ts
```typescript
import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import { SwaggerModule, DocumentBuilder } from '@nestjs/swagger';
import { AppModule } from './app.module';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  
  // Global validation pipe
  app.useGlobalPipes(new ValidationPipe({
    whitelist: true,
    forbidNonWhitelisted: true,
    transform: true,
  }));

  // CORS configuration (similar to your Express setup)
  app.enableCors({
    origin: '*',
    methods: 'GET,HEAD,PUT,PATCH,POST,DELETE,OPTIONS',
    allowedHeaders: 'Authorization,X-API-KEY,Origin,X-Requested-With,Content-Type,Access-Control-Allow-Request-Method',
  });

  // Security headers
  app.use((req, res, next) => {
    res.header('X-Content-Type-Options', 'nosniff');
    res.header('X-Frame-Options', 'DENY');
    res.header('X-XSS-Protection', '1; mode=block');
    res.header('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
    next();
  });

  // Swagger documentation
  const config = new DocumentBuilder()
    .setTitle('WhatsApp CRM API')
    .setDescription('WhatsApp Bot with CRM capabilities')
    .setVersion('2.0')
    .addBearerAuth()
    .build();
  const document = SwaggerModule.createDocument(app, config);
  SwaggerModule.setup('api/docs', app, document);

  // Global prefix
  app.setGlobalPrefix('api/v2');

  await app.listen(process.env.PORT || 5000);
}
bootstrap();
```

#### app.module.ts
```typescript
import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { ThrottlerModule } from '@nestjs/throttler';
import { DatabaseModule } from './database/database.module';
import { WhatsappModule } from './modules/whatsapp/whatsapp.module';
import { OpenaiModule } from './modules/openai/openai.module';
import { WebsocketModule } from './modules/websocket/websocket.module';
import { AuthModule } from './modules/auth/auth.module';
import { CustomersModule } from './modules/customers/customers.module';
import { ConversationsModule } from './modules/conversations/conversations.module';
import { TicketsModule } from './modules/tickets/tickets.module';
import { MediaModule } from './modules/media/media.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
    }),
    ThrottlerModule.forRoot({
      ttl: 60,
      limit: 10,
    }),
    DatabaseModule,
    AuthModule,
    WhatsappModule,
    OpenaiModule,
    WebsocketModule,
    CustomersModule,
    ConversationsModule,
    TicketsModule,
    MediaModule,
  ],
})
export class AppModule {}
```

### Step 2: Database Configuration

#### database/database.module.ts
```typescript
import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { ConfigService } from '@nestjs/config';

@Module({
  imports: [
    MongooseModule.forRootAsync({
      useFactory: async (configService: ConfigService) => ({
        uri: configService.get<string>('MONGODB'),
        useNewUrlParser: true,
        useUnifiedTopology: true,
      }),
      inject: [ConfigService],
    }),
  ],
})
export class DatabaseModule {}
```

#### database/entities/user-thread.entity.ts
```typescript
import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';

export type UserThreadDocument = UserThread & Document;

@Schema({ timestamps: true })
export class UserThread {
  @Prop({ required: true, index: true })
  userId: string;

  @Prop({ required: true })
  threadId: string;

  @Prop({ default: 0 })
  messageCount: number;

  @Prop()
  lastInteraction: Date;

  @Prop()
  lastCleanup: Date;

  @Prop({ default: true })
  isActive: boolean;
}

export const UserThreadSchema = SchemaFactory.createForClass(UserThread);

// Create indexes
UserThreadSchema.index({ userId: 1 }, { unique: true });
UserThreadSchema.index({ threadId: 1 });
```

### Step 3: WhatsApp Module Migration

#### modules/whatsapp/whatsapp.controller.ts
```typescript
import { Controller, Get, Post, Body, Query, Req } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse } from '@nestjs/swagger';
import { WhatsappService } from './whatsapp.service';
import { WebhookDto } from './dto/webhook.dto';
import { SendMessageDto } from './dto/send-message.dto';
import { WebsocketGateway } from '../websocket/websocket.gateway';

@ApiTags('WhatsApp')
@Controller()
export class WhatsappController {
  constructor(
    private readonly whatsappService: WhatsappService,
    private readonly websocketGateway: WebsocketGateway,
  ) {}

  @Get()
  @ApiOperation({ summary: 'WhatsApp webhook verification' })
  @ApiResponse({ status: 200, description: 'Webhook verified successfully' })
  verifyToken(@Query() query: any) {
    return this.whatsappService.verifyToken(query);
  }

  @Post()
  @ApiOperation({ summary: 'Receive WhatsApp webhook' })
  @ApiResponse({ status: 200, description: 'Message processed successfully' })
  async receivedMessage(@Body() webhookData: WebhookDto, @Req() req: any) {
    // Emit to WebSocket for real-time updates
    this.websocketGateway.handleIncomingMessage(webhookData);
    
    return await this.whatsappService.processIncomingMessage(webhookData);
  }

  @Post('send')
  @ApiOperation({ summary: 'Send template message' })
  @ApiResponse({ status: 200, description: 'Message sent successfully' })
  async sendTemplateMessage(@Body() sendMessageDto: SendMessageDto) {
    return await this.whatsappService.sendTemplateMessage(sendMessageDto);
  }

  @Post('cleanup-thread')
  @ApiOperation({ summary: 'Cleanup user thread' })
  @ApiResponse({ status: 200, description: 'Thread cleaned up successfully' })
  async cleanupUserThread(@Body() body: { userId: string }) {
    return await this.whatsappService.cleanupUserThread(body.userId);
  }
}
```

#### modules/whatsapp/whatsapp.service.ts
```typescript
import { Injectable, BadRequestException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { UserThread, UserThreadDocument } from '../../database/entities/user-thread.entity';
import { OpenaiService } from '../openai/openai.service';
import { WebhookDto } from './dto/webhook.dto';

@Injectable()
export class WhatsappService {
  constructor(
    private configService: ConfigService,
    private openaiService: OpenaiService,
    @InjectModel(UserThread.name) private userThreadModel: Model<UserThreadDocument>,
  ) {}

  verifyToken(query: any) {
    const accessToken = this.configService.get<string>('WHATSAPP_ACCESS_TOKEN');
    const token = query['hub.verify_token'];
    const challenge = query['hub.challenge'];

    if (challenge && token && accessToken === token) {
      return challenge;
    }

    throw new BadRequestException('Token validation failed');
  }

  async processIncomingMessage(webhookData: WebhookDto) {
    const { entry } = webhookData;
    
    if (!entry || !entry[0]?.changes) {
      return { status: 'EVENT_RECEIVED' };
    }

    const { changes } = entry[0];
    const { value } = changes[0];
    const { messages } = value;

    if (!messages || messages.length === 0) {
      return { status: 'EVENT_RECEIVED' };
    }

    const messageObject = messages[0];
    const messageType = messageObject.type;

    switch (messageType) {
      case 'text':
        await this.handleTextMessage(messageObject);
        break;
      case 'image':
        await this.handleImageMessage(messageObject);
        break;
      case 'location':
        await this.handleLocationMessage(messageObject);
        break;
      case 'interactive':
        await this.handleInteractiveMessage(messageObject);
        break;
      default:
        console.log('Unhandled message type:', messageType);
    }

    return { status: 'EVENT_RECEIVED' };
  }

  private async handleTextMessage(messageObject: any) {
    const userRequest = messageObject.text.body;
    const messageId = messageObject.id;
    let phoneNumber = messageObject.from;

    // Format Mexican phone numbers (13 digits to 12 digits)
    if (phoneNumber.length === 13) {
      phoneNumber = phoneNumber.substring(1);
    }

    try {
      // Show typing indicator
      await this.sendTypingIndicator(messageId, 'text');

      // Get AI response
      const aiReply = await this.openaiService.getAIResponse(userRequest, phoneNumber);

      // Send reply
      await this.sendTextMessage(phoneNumber, aiReply);
    } catch (error) {
      console.error('Error handling text message:', error);
      await this.sendTextMessage(phoneNumber, 'Lo siento, hubo un error procesando tu mensaje.');
    }
  }

  private async handleImageMessage(messageObject: any) {
    // Implementation for image handling
    console.log('Image message received:', messageObject.image);
    // TODO: Implement Cloudinary upload
  }

  private async handleLocationMessage(messageObject: any) {
    // Implementation for location handling
    console.log('Location message received:', messageObject.location);
    // TODO: Implement geocoding
  }

  private async handleInteractiveMessage(messageObject: any) {
    // Implementation for interactive message handling
    console.log('Interactive message received:', messageObject.interactive);
  }

  async sendTextMessage(phoneNumber: string, message: string) {
    // Implementation for sending WhatsApp messages
    // Use your existing WhatsApp API integration
  }

  async sendTypingIndicator(messageId: string, type: string) {
    // Implementation for typing indicator
  }

  async sendTemplateMessage(sendMessageDto: any) {
    // Implementation for template messages
  }

  async cleanupUserThread(userId: string) {
    return await this.openaiService.cleanupUserThread(userId);
  }
}
```

### Step 4: OpenAI Service Migration

#### modules/openai/openai.service.ts
```typescript
import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import axios from 'axios';
import { UserThread, UserThreadDocument } from '../../database/entities/user-thread.entity';

@Injectable()
export class OpenaiService {
  private readonly logger = new Logger(OpenaiService.name);
  private readonly userThreads = new Map<string, string>();
  private readonly baseUrl = 'https://api.openai.com/v1';
  private readonly maxMessagesPerThread = 10;
  private readonly cleanupThreshold = 15;

  constructor(
    private configService: ConfigService,
    @InjectModel(UserThread.name) private userThreadModel: Model<UserThreadDocument>,
  ) {}

  async getAIResponse(message: string, userId: string): Promise<string> {
    const apiKey = this.configService.get<string>('OPENAI_API_KEY');
    const assistantId = this.configService.get<string>('OPENAI_ASSISTANT_ID');

    if (!apiKey || !assistantId) {
      throw new Error('OpenAI configuration missing');
    }

    const headers = {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
      'OpenAI-Beta': 'assistants=v2',
    };

    try {
      // Get or create thread
      const threadId = await this.getOrCreateThread(userId, headers);

      // Ensure no active runs
      await this.ensureNoActiveRun(threadId, headers);

      // Add message to thread
      await axios.post(
        `${this.baseUrl}/threads/${threadId}/messages`,
        {
          role: 'user',
          content: message,
          metadata: { phone_number: userId },
        },
        { headers }
      );

      // Run assistant
      const runResponse = await axios.post(
        `${this.baseUrl}/threads/${threadId}/runs`,
        {
          assistant_id: assistantId,
          additional_instructions: `The user's WhatsApp phone number is: ${userId}.`,
        },
        { headers }
      );

      const runId = runResponse.data.id;

      // Poll for completion
      let run = await this.pollRunCompletion(threadId, runId, headers);

      // Handle tool calls if needed
      let toolCallAttempts = 0;
      const maxToolCallAttempts = 3;

      while (
        run.status === 'requires_action' &&
        run.required_action?.submit_tool_outputs &&
        toolCallAttempts < maxToolCallAttempts
      ) {
        const toolCalls = run.required_action.submit_tool_outputs.tool_calls;
        await this.handleToolCalls(threadId, runId, toolCalls, headers, userId);
        run = await this.pollRunCompletion(threadId, runId, headers);
        toolCallAttempts++;
      }

      if (run.status !== 'completed') {
        this.logger.error('Run failed with status:', run.status);
        return 'Lo siento, no pude procesar tu mensaje en este momento.';
      }

      // Get response
      const messagesResponse = await axios.get(
        `${this.baseUrl}/threads/${threadId}/messages`,
        { headers }
      );

      const assistantMessages = messagesResponse.data.data.filter(
        (msg) => msg.role === 'assistant'
      );

      if (assistantMessages.length > 0) {
        const latestMessage = assistantMessages[0];
        const textContent = latestMessage.content.find((c) => c.type === 'text');
        return textContent?.text?.value || 'No response from AI.';
      }

      return 'No response from AI.';
    } catch (error) {
      this.logger.error('OpenAI error:', error.response?.data || error.message);
      return 'Lo siento, hubo un error con el asistente IA.';
    }
  }

  private async getOrCreateThread(userId: string, headers: any): Promise<string> {
    // Check in-memory cache
    let threadId = this.userThreads.get(userId);

    if (threadId) {
      this.logger.log(`Using cached thread ${threadId} for user ${userId}`);
      return threadId;
    }

    // Check database
    let userThread = await this.userThreadModel.findOne({ userId });

    if (userThread) {
      threadId = userThread.threadId;
      this.userThreads.set(userId, threadId);
      this.logger.log(`Loaded thread ${threadId} from DB for user ${userId}`);

      // Check if cleanup is needed
      if (userThread.messageCount >= this.cleanupThreshold) {
        await this.cleanupThreadMessages(threadId, headers);
        userThread.messageCount = this.maxMessagesPerThread;
        userThread.lastCleanup = new Date();
        await userThread.save();
      }

      return threadId;
    }

    // Create new thread
    const threadResponse = await axios.post(
      `${this.baseUrl}/threads`,
      {
        metadata: {
          user_id: userId,
          phone_number: userId,
        },
      },
      { headers }
    );

    threadId = threadResponse.data.id;
    this.userThreads.set(userId, threadId);

    // Save to database
    await this.userThreadModel.create({
      userId,
      threadId,
      messageCount: 1,
      lastInteraction: new Date(),
    });

    this.logger.log(`Created new thread ${threadId} for user ${userId}`);
    return threadId;
  }

  private async ensureNoActiveRun(threadId: string, headers: any) {
    // Implementation similar to your current code
  }

  private async pollRunCompletion(threadId: string, runId: string, headers: any) {
    // Implementation similar to your current code
  }

  private async handleToolCalls(threadId: string, runId: string, toolCalls: any[], headers: any, userId: string) {
    // Implementation similar to your current code
  }

  private async cleanupThreadMessages(threadId: string, headers: any) {
    // Implementation similar to your current code
  }

  async cleanupUserThread(userId: string): Promise<boolean> {
    const userThread = await this.userThreadModel.findOne({ userId });
    
    if (!userThread) {
      return false;
    }

    // Implement cleanup logic
    return true;
  }
}
```

### Step 5: WebSocket Gateway

#### modules/websocket/websocket.gateway.ts
```typescript
import {
  WebSocketGateway,
  WebSocketServer,
  SubscribeMessage,
  OnGatewayConnection,
  OnGatewayDisconnect,
} from '@nestjs/websockets';
import { Logger } from '@nestjs/common';
import { Server, Socket } from 'socket.io';

@WebSocketGateway({
  cors: {
    origin: '*',
  },
})
export class WebsocketGateway implements OnGatewayConnection, OnGatewayDisconnect {
  @WebSocketServer()
  server: Server;

  private logger: Logger = new Logger('WebsocketGateway');

  handleConnection(client: Socket) {
    this.logger.log(`Client connected: ${client.id}`);
  }

  handleDisconnect(client: Socket) {
    this.logger.log(`Client disconnected: ${client.id}`);
  }

  @SubscribeMessage('join_conversation')
  handleJoinConversation(client: Socket, conversationId: string) {
    client.join(`conversation_${conversationId}`);
    this.logger.log(`Client ${client.id} joined conversation ${conversationId}`);
  }

  @SubscribeMessage('leave_conversation')
  handleLeaveConversation(client: Socket, conversationId: string) {
    client.leave(`conversation_${conversationId}`);
    this.logger.log(`Client ${client.id} left conversation ${conversationId}`);
  }

  handleIncomingMessage(webhookData: any) {
    this.server.emit('incoming_messages', webhookData);
  }

  emitNewMessage(conversationId: string, messageData: any) {
    this.server.to(`conversation_${conversationId}`).emit('new_message', messageData);
  }

  emitConversationUpdate(conversationId: string, updateData: any) {
    this.server.to(`conversation_${conversationId}`).emit('conversation_update', updateData);
  }
}
```

## Migration Commands for Copilot

When creating your new NestJS project in another folder, you can use these commands with GitHub Copilot:

### 1. Initial Setup Commands
```bash
# Create NestJS project
npx @nestjs/cli new whatsapp-crm-nestjs

# Install dependencies
npm install @nestjs/mongoose @nestjs/websockets @nestjs/platform-socket.io @nestjs/config @nestjs/swagger @nestjs/jwt @nestjs/passport @nestjs/throttler mongoose socket.io axios node-fetch swagger-ui-express class-validator class-transformer passport passport-jwt bcryptjs
```

### 2. Copilot Instructions for Each Module

#### For WhatsApp Module:
```
Create a NestJS module for WhatsApp integration with:
- Controller with endpoints for webhook verification, receiving messages, and sending messages
- Service to handle message processing and WhatsApp API calls
- DTOs for webhook validation and message sending
- Integration with OpenAI service for AI responses
- Support for different message types: text, image, location, interactive
```

#### For OpenAI Module:
```
Create a NestJS service for OpenAI Assistant integration with:
- Thread management per user with MongoDB persistence
- Message cleanup functionality to maintain optimal thread size
- Tool calling support for ticket creation and information retrieval
- Error handling and retry logic
- TypeScript interfaces for OpenAI API responses
```

#### For WebSocket Module:
```
Create a NestJS WebSocket gateway with:
- Real-time message broadcasting
- Room management for conversations
- Connection/disconnection handling
- Events for incoming messages, conversation updates, and agent status
- Integration with WhatsApp webhook events
```

### 3. Environment Variables Setup
Create `.env` file with:
```env
# Server
PORT=5000
NODE_ENV=development

# Database
MONGODB=mongodb://localhost:27017/whatsapp-crm

# WhatsApp
WHATSAPP_URI=graph.facebook.com
WHATSAPP_VERSION=v20.0
WHATSAPP_PHONE_NUMBER_ID=your_phone_id
WHATSAPP_API_TOKEN=your_api_token
WHATSAPP_ACCESS_TOKEN=your_access_token
WHATSAPP_ADMIN=admin_phone_number

# OpenAI
OPENAI_API_KEY=your_openai_key
OPENAI_ASSISTANT_ID=your_assistant_id

# JWT
JWT_SECRET=your_jwt_secret
JWT_EXPIRES_IN=1h
```

## Testing Strategy

### 1. Unit Tests
```bash
# Generate test files for each service
nest generate service whatsapp --no-spec=false
nest generate service openai --no-spec=false
```

### 2. Integration Tests
```bash
# Test WhatsApp webhook integration
# Test OpenAI API integration
# Test WebSocket functionality
```

### 3. E2E Tests
```bash
# Test complete message flow
# Test AI response generation
# Test real-time updates
```

## Advantages of NestJS Migration

### 1. Better Structure
- Modular architecture makes it easier to add CRM features
- Dependency injection simplifies testing and service management
- Built-in validation and transformation

### 2. TypeScript First
- Better type safety
- Enhanced developer experience
- Easier refactoring

### 3. Enterprise Features
- Built-in authentication and authorization
- Automatic API documentation with Swagger
- Rate limiting and security features
- Microservices support for future scaling

### 4. Future CRM Extensions
- Easy to add new modules (customers, agents, tickets)
- Built-in guards for role-based access
- Interceptors for logging and auditing
- Pipes for data transformation

## Migration Timeline

### Week 1: Core Setup
- Set up NestJS project structure
- Migrate database configuration
- Create basic entities

### Week 2: WhatsApp Integration
- Migrate WhatsApp controller and service
- Implement webhook handling
- Test message processing

### Week 3: OpenAI Integration
- Migrate OpenAI service
- Implement thread management
- Test AI responses

### Week 4: WebSocket & Testing
- Migrate WebSocket functionality
- Add comprehensive tests
- Deploy and verify functionality

This migration will give you a much more scalable and maintainable foundation for building your WhatsApp CRM system!