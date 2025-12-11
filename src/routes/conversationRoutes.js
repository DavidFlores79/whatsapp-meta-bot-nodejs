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
// MESSAGING
// =====================================
router.post('/:id/reply', authenticateToken, apiLimiter, conversationController.sendReply);
router.get('/:id/messages', authenticateToken, apiLimiter, conversationController.getConversationMessages);

// =====================================
// AI CONTROL
// =====================================
router.post('/:id/resume-ai', authenticateToken, apiLimiter, conversationController.resumeAI);

// =====================================
// NOTES
// =====================================
router.post('/:id/notes', authenticateToken, apiLimiter, conversationController.addInternalNote);

module.exports = router;
