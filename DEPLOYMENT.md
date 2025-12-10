# Deployment Guide

This guide explains how to deploy the WhatsApp CRM application. The application consists of a Node.js backend and an Angular frontend, which are served together as a single monolithic application.

## Prerequisites

- Node.js (v18 or higher)
- MongoDB (local or Atlas)
- OpenAI API Key
- Meta (WhatsApp) Developer Account

## Build Process

The frontend needs to be built into static files that the backend can serve.

1.  **Install Dependencies:**
    ```bash
    # Root (Backend)
    npm install

    # Frontend
    cd frontend
    npm install
    ```

2.  **Build Frontend:**
    ```bash
    cd frontend
    npm run build
    ```
    This will generate the build artifacts in `frontend/dist/frontend/browser`.

## Running the Application

### Development
In development, you typically run the backend and frontend separately to get hot-reloading.

1.  **Backend:**
    ```bash
    npm run dev
    ```
    Runs on port `3010`.

2.  **Frontend:**
    ```bash
    cd frontend
    npm start
    ```
    Runs on port `4200` (proxies API calls to `3010`).

### Production
In production, the backend serves the built frontend files.

1.  **Build the frontend** (as shown above).
2.  **Start the backend:**
    ```bash
    npm start
    ```
    The application will be available on port `3010` (or `PORT` env var).
    Accessing `http://localhost:3010` will load the Angular app.

## Environment Variables

Ensure your `.env` file or environment variables are set:

```env
PORT=3010
MONGODB_URI=mongodb://localhost:27017/whatsapp_bot
OPENAI_API_KEY=sk-...
OPENAI_ASSISTANT_ID=asst_...
# ... other WhatsApp credentials
```

## Deployment Options

### Option 1: VPS (DigitalOcean, EC2, etc.)
1.  Clone the repository.
2.  Install dependencies and build the frontend.
3.  Use `pm2` to run the backend:
    ```bash
    pm2 start src/app.js --name "whatsapp-crm"
    ```
4.  Set up Nginx as a reverse proxy to port `3010`.

### Option 2: PaaS (Heroku, Railway, Render)
1.  Add a `build` script to the root `package.json` to build the frontend during deployment:
    ```json
    "scripts": {
      "build": "cd frontend && npm install && npm run build",
      "start": "node src/app.js"
    }
    ```
2.  Deploy the repository. The platform will run `npm install`, `npm run build`, and then `npm start`.
