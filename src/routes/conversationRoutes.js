const express = require('express');
const router = express.Router();
const conversationController = require('../controllers/conversationController');
const { authenticateToken } = require('../middleware/authMiddleware');
const { apiLimiter } = require('../middleware/rateLimitMiddleware');

// =====================================
// CONVERSATION MANAGEMENT
// =====================================
router.get('/', authenticateToken, apiLimiter, conversationController.getConversations);
router.get('/assigned', authenticateToken, apiLimiter, conversationController.getAssignedConversations);
router.get('/:id', authenticateToken, apiLimiter, conversationController.getConversationById);

// =====================================
// ASSIGNMENT ACTIONS
// =====================================
router.post('/:id/assign', authenticateToken, apiLimiter, conversationController.assignConversation);
router.post('/:id/release', authenticateToken, apiLimiter, conversationController.releaseConversation);
router.post('/:id/transfer', authenticateToken, apiLimiter, conversationController.transferConversation);

// =====================================
// LIFECYCLE MANAGEMENT
// =====================================
router.post('/:id/resolve', authenticateToken, apiLimiter, conversationController.resolveConversationEndpoint);
router.post('/:id/close', authenticateToken, apiLimiter, conversationController.closeConversationEndpoint);
router.post('/:id/reopen', authenticateToken, apiLimiter, conversationController.reopenConversationEndpoint);
router.post('/:id/priority', authenticateToken, apiLimiter, conversationController.setConversationPriorityEndpoint);

// =====================================
// MESSAGING
// =====================================
router.post('/:id/reply', authenticateToken, apiLimiter, conversationController.sendReply);
router.get('/:id/messages', authenticateToken, apiLimiter, conversationController.getConversationMessages);
router.get('/:id/thread-metadata', authenticateToken, apiLimiter, conversationController.getThreadMetadata);

// =====================================
// AI CONTROL
// =====================================
router.post('/:id/resume-ai', authenticateToken, apiLimiter, conversationController.resumeAI);

// =====================================
// NOTES
// =====================================
router.post('/:id/notes', authenticateToken, apiLimiter, conversationController.addInternalNote);

// =====================================
// ANALYTICS & HISTORY
// =====================================
router.get('/:id/assignment-history', authenticateToken, apiLimiter, conversationController.getAssignmentHistory);

// =====================================
// TICKETS
// =====================================
router.get('/:conversationId/tickets', authenticateToken, apiLimiter, require('../controllers/ticketController').getConversationTickets);

module.exports = router;
