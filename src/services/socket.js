const { io } = require('../models/server');
const autoTimeoutService = require('./autoTimeoutService');

// Track which socket IDs belong to authenticated agents
const authenticatedAgentSockets = new Set();

//sockets
io.on('connection', (socket) => {
    console.log('Socket connected:', socket.id);

    // Agent authentication (join agent room)
    socket.on('agent_authenticate', (data) => {
        const { agentId } = data;
        socket.join(`agent_${agentId}`);
        console.log(`Agent ${agentId} joined room agent_${agentId}`);

        const wasEmpty = authenticatedAgentSockets.size === 0;
        authenticatedAgentSockets.add(socket.id);

        if (wasEmpty) {
            autoTimeoutService.resumeAutoTimeoutService();
        }

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

        if (authenticatedAgentSockets.has(socket.id)) {
            authenticatedAgentSockets.delete(socket.id);

            if (authenticatedAgentSockets.size === 0) {
                autoTimeoutService.pauseAutoTimeoutService();
            }
        }
    });
});

console.log('Socket.io events initialized');

module.exports = { io };