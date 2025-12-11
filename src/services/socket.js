const { io } = require('../models/server');

//sockets
io.on('connection', (socket) => {
    console.log('Socket connected:', socket.id);

    // Agent authentication (join agent room)
    socket.on('agent_authenticate', (data) => {
        const { agentId } = data;
        socket.join(`agent_${agentId}`);
        console.log(`Agent ${agentId} joined room agent_${agentId}`);

        socket.emit('authenticated', { success: true, agentId });
    });

    // Agent status updates
    socket.on('agent_status_update', (data) => {
        io.emit('agent_status_changed', data);
    });

    // Typing indicators
    socket.on('agent_typing', (data) => {
        const { conversationId, agentId } = data;
        socket.broadcast.emit('agent_typing', { conversationId, agentId });
    });

    // Mark messages as read
    socket.on('mark_as_read', (data) => {
        const { conversationId } = data;
        socket.broadcast.emit('messages_read', { conversationId });
    });

    socket.on('disconnect', () => {
        console.log('Socket disconnected:', socket.id);
    });
});

console.log('Socket.io events initialized');

module.exports = { io };