const express = require('express');
const router = express.Router();
const multer = require('multer');
const conversationController = require('../controllers/conversationController');
const { authenticateToken } = require('../middleware/authMiddleware');
const { apiLimiter } = require('../middleware/rateLimitMiddleware');

// Configure multer for memory storage (files go to buffer, not disk)
const upload = multer({
    storage: multer.memoryStorage(),
    limits: {
        fileSize: 100 * 1024 * 1024, // 100MB max (WhatsApp document limit)
    }
});

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
router.post('/:id/reply-media', authenticateToken, upload.single('file'), conversationController.sendMediaReply);
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
