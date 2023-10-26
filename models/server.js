const express = require("express");
const { dbConnection } = require("../database/config");
const bodyParser = require("body-parser");
require('dotenv').config()

const wttpRoutes = require("../routes/wttpRoutes");
const whatsappRoutes = require("../routes/whatsappRoutes");

class Server {
  constructor() {
    this.app = express();
    this.port = process.env.PORT || 5000;

    const http = require('http').createServer(this.app);
    const io = require('socket.io')(http);

    //sockets
    io.on('connection', (socket) => {
      console.log('Socket connected!');

      socket.on('disconnected', () => {
        console.log('Socket disconnected!');
      });
    });

    http.listen(this.port, () => {
      console.log(`Listen on port ${this.port}`);
    });


    //conectar a DB
    this.conectarDB();

    //middlewares
    this.middlewares();

    this.app.post('/api/v1/incoming_messages', async function (req, res) {
      // console.log('Webhook', req.body);
      io.emit('incoming_messages', req.body);
    });

    //rutas de mi aplicacion
    this.routes();
  }

  middlewares() {
    //directorio public
    this.app.use(express.static("public"));
    this.app.use(express.json());


    this.app.use((req, res, next) => {
      res.header('Access-Control-Allow-Origin', '*');
      res.header('Access-Control-Allow-Headers', 'Authorization, X-API-KEY, Origin, X-Requested-With, Content-Type, Access-Control-Allow-Request-Method');
      res.header('Access-Control-Allow-Methods', 'GET, PUT, POST, DELETE, OPTIONS');
      res.header('Allow', 'GET, PUT, POST, DELETE, OPTIONS');
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
  }

  async conectarDB() {
    await dbConnection();
  }

  routes() {
    this.app.use("/api/v1", wttpRoutes);
    this.app.use("/api/v2", whatsappRoutes);
  }

  listen() {
    // this.app.listen(this.port, () => {
    //   console.log(`API lista en el puerto ${this.port}`);
    // });
  }
}

module.exports = Server;
