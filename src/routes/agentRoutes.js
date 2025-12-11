const express = require('express');
const router = express.Router();
const agentController = require('../controllers/agentController');
const { authenticateToken, requireRole } = require('../middleware/authMiddleware');
const { authLimiter, apiLimiter } = require('../middleware/rateLimitMiddleware');

// =====================================
// AUTHENTICATION ROUTES (Public)
// =====================================
router.post('/auth/login', authLimiter, agentController.login);
router.post('/auth/refresh', authLimiter, agentController.refreshToken);
router.post('/auth/logout', authenticateToken, agentController.logout);

// =====================================
// AGENT PROFILE ROUTES (Authenticated)
// =====================================
router.get('/profile', authenticateToken, apiLimiter, agentController.getProfile);
router.patch('/profile', authenticateToken, apiLimiter, agentController.updateProfile);
router.patch('/status', authenticateToken, apiLimiter, agentController.updateStatus);

// =====================================
// AGENT MANAGEMENT (Admin/Supervisor)
// =====================================
router.get('/', authenticateToken, requireRole('admin', 'supervisor'), apiLimiter, agentController.getAllAgents);
router.post('/', authenticateToken, requireRole('admin'), apiLimiter, agentController.createAgent);
router.get('/:id', authenticateToken, apiLimiter, agentController.getAgentById);
router.patch('/:id', authenticateToken, requireRole('admin', 'supervisor'), apiLimiter, agentController.updateAgent);
router.delete('/:id', authenticateToken, requireRole('admin'), apiLimiter, agentController.deleteAgent);

// =====================================
// STATISTICS
// =====================================
router.get('/:id/statistics', authenticateToken, apiLimiter, agentController.getAgentStatistics);

module.exports = router;
