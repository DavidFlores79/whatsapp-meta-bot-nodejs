const express = require("express");
const path = require("path");
const { dbConnection } = require("../database/config");
const bodyParser = require("body-parser");
require('dotenv').config()



class Server {
  constructor() {
    this.app = express();
    this.port = process.env.PORT || 5001;

    const http = require('http').createServer(this.app);
    const io = require('socket.io')(http, {
      cors: {
        origin: "*", // Allow all origins for development
        methods: ["GET", "POST"]
      }
    });
    module.exports.io = io;
    require('../services/socket');

    http.listen(this.port, () => {
      console.log(`Listen on port ${this.port}`);
    });


    //conectar a DB
    this.conectarDB();

    // Initialize background services
    const autoTimeoutService = require('../services/autoTimeoutService');
    autoTimeoutService.startAutoTimeoutService();

    //middlewares
    this.middlewares(io);

    //rutas de mi aplicacion
    this.routes();
  }

  middlewares(io) {
    // Trust proxy - required when behind reverse proxy (nginx, apache)
    this.app.set('trust proxy', true);

    // Serve static files from Angular build
    const frontendPath = path.join(__dirname, '../../frontend/dist/frontend/browser');
    this.app.use(express.static(frontendPath));
    this.app.use(express.static("public")); // Keep public for other assets if any
    this.app.use(express.json());


    this.app.use((req, res, next) => {
      res.header('Access-Control-Allow-Origin', '*');
      res.header('Access-Control-Allow-Headers', 'Authorization, X-API-KEY, Origin, X-Requested-With, Content-Type, Access-Control-Allow-Request-Method');
      res.header('Access-Control-Allow-Methods', 'GET, PUT, POST, DELETE, OPTIONS');
      res.header('Allow', 'GET, PUT, POST, DELETE, OPTIONS');

      // Security headers
      res.header('X-Content-Type-Options', 'nosniff');
      res.header('X-Frame-Options', 'DENY');
      res.header('X-XSS-Protection', '1; mode=block');
      res.header('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');

      next();
    });

    this.app.use(
      bodyParser.json({
        limit: "20mb",
      })
    );

    this.app.use(
      bodyParser.urlencoded({
        limit: "20mb",
        extended: true,
      })
    );

    //pasar io para emit desde controller
    this.app.use(function (req, res, next) {
      req.io = io;
      next();
    });
  }

  async conectarDB() {
    await dbConnection();
  }

  routes() {
    // IMPORTANT: Register more specific routes BEFORE generic ones
    // Otherwise /api/v2/conversations will match /api/v2 first
    this.app.use("/api/v2/agents", require("../routes/agentRoutes"));
    this.app.use("/api/v2/conversations", require("../routes/conversationRoutes"));
    this.app.use("/api/v2/customers", require("../routes/customerRoutes"));
    this.app.use("/api/v2/templates", require("../routes/templateRoutes"));
    this.app.use("/api/v2", require("../routes/whatsappRoutes"));
    this.app.use("/health", require("../routes/healthRoutes"));
    this.app.use("/info", require("../routes/infoRoutes"));

    // Handle Angular routing - return index.html for all other routes
    this.app.get('*', (req, res) => {
      res.sendFile(path.join(__dirname, '../../frontend/dist/frontend/browser/index.html'));
    });
  }

  listen() { }
}

module.exports = Server;
