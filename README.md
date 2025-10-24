# WhatsApp Meta Bot Node.js

A WhatsApp bot implementation using the WhatsApp Cloud API that handles incoming webhook events and provides message processing capabilities.

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
PORT=5000
MONGODB=your_mongodb_connection_string
WHATSAPP_URI=graph.facebook.com
WHATSAPP_VERSION=v20.0
WHATSAPP_PHONE_NUMBER_ID=your_phone_number_id
WHATSAPP_API_TOKEN=your_api_token
WHATSAPP_ACCESS_TOKEN=your_access_token
WHATSAPP_ADMIN=admin_phone_number
OPENAI_API_KEY=your_openai_api_key
OPENAI_ASSISTANT_ID=your_openai_assistant_id
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

## Project Structure

```
src/
├── app.js                    # Application entry point
├── controllers/
│   └── whatsappController.js # WhatsApp webhook handlers
├── models/
│   └── server.js            # Express server configuration
├── routes/
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

## OpenAI Assistant Integration

Text messages sent to the bot are processed by OpenAI Assistant for AI-powered responses. Configure your OpenAI API key and Assistant ID in the environment variables:

- `OPENAI_API_KEY`: Your OpenAI API key
- `OPENAI_ASSISTANT_ID`: The Assistant ID to use for responses

## License

ISC