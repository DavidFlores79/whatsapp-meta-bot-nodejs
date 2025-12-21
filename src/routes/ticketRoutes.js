const express = require('express');
const router = express.Router();
const ticketController = require('../controllers/ticketController');
const { authenticateToken } = require('../middleware/authMiddleware');

// All ticket routes require authentication
router.use(authenticateToken);

/**
 * GET /api/v2/tickets
 * Get all tickets with filters and pagination
 * Query params: page, limit, status, category, priority, assignedAgent, search
 */
router.get('/', ticketController.getTickets);

/**
 * GET /api/v2/tickets/statistics
 * Get ticket statistics
 * Query params: agentId, customerId
 */
router.get('/statistics', ticketController.getStatistics);

/**
 * GET /api/v2/tickets/:id
 * Get single ticket by ID
 */
router.get('/:id', ticketController.getTicket);

/**
 * POST /api/v2/tickets
 * Create new ticket (manual creation by agent)
 * Body: { subject, description, category, priority, customerId, conversationId, tags }
 */
router.post('/', ticketController.createTicket);

/**
 * PUT /api/v2/tickets/:id
 * Update ticket
 * Body: any ticket fields except ticketId, customerId, createdAt
 */
router.put('/:id', ticketController.updateTicket);

/**
 * PUT /api/v2/tickets/:id/status
 * Change ticket status
 * Body: { status, reason }
 */
router.put('/:id/status', ticketController.changeStatus);

/**
 * PUT /api/v2/tickets/:id/assign
 * Assign ticket to agent
 * Body: { agentId }
 */
router.put('/:id/assign', ticketController.assignTicket);

/**
 * POST /api/v2/tickets/:id/notes
 * Add note to ticket
 * Body: { content, isInternal }
 */
router.post('/:id/notes', ticketController.addNote);

/**
 * PUT /api/v2/tickets/:id/resolve
 * Resolve ticket
 * Body: { summary, steps, category }
 */
router.put('/:id/resolve', ticketController.resolveTicket);

/**
 * PUT /api/v2/tickets/:id/escalate
 * Escalate ticket
 * Body: { toAgentId, reason }
 */
router.put('/:id/escalate', ticketController.escalateTicket);

module.exports = router;
