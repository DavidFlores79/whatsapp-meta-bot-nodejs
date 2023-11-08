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
    module.exports.io = io;
    require('../services/socket');

    http.listen(this.port, () => {
      console.log(`Listen on port ${this.port}`);
    });


    //conectar a DB
    this.conectarDB();

    //middlewares
    this.middlewares(io);

    //rutas de mi aplicacion
    this.routes();
  }

  middlewares(io) {
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

    //pasar io para emit desde controller
    this.app.use(function(req, res, next) {
      req.io = io;
      next();
    });
  }

  async conectarDB() {
    await dbConnection();
  }

  routes() {
    this.app.use("/api/v1", wttpRoutes);
    this.app.use("/api/v2", whatsappRoutes);
  }

  listen() {}
}

module.exports = Server;
