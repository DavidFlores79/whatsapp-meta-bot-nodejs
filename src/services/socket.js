const { io } = require('../models/server');

//sockets
io.on('connection', (socket) => {
    console.log('Socket connected!');

    socket.on('disconnected', () => {
        console.log('Socket disconnected!');
    });
});

module.exports = { io };