const express = require('express');
const router = express.Router();
const configController = require('../controllers/configurationController');
const { authenticateToken } = require('../middleware/authMiddleware');

// All configuration routes require authentication
router.use(authenticateToken);

// Admin-only middleware (can be added later for specific routes)
// For now, all authenticated agents can read configurations
// Only admins should be able to update (implement in middleware)

/**
 * GET /api/v2/config
 * Get all configurations
 */
router.get('/', configController.getAllConfigurations);

/**
 * GET /api/v2/config/ticket-categories
 * Get ticket categories
 */
router.get('/ticket-categories', configController.getTicketCategories);

/**
 * PUT /api/v2/config/ticket-categories
 * Update ticket categories (admin only)
 */
router.put('/ticket-categories', configController.updateTicketCategories);

/**
 * GET /api/v2/config/assistant
 * Get assistant configuration
 */
router.get('/assistant', configController.getAssistantConfig);

/**
 * PUT /api/v2/config/assistant
 * Update assistant configuration (admin only)
 */
router.put('/assistant', configController.updateAssistantConfig);

/**
 * GET /api/v2/config/terminology
 * Get ticket terminology
 */
router.get('/terminology', configController.getTerminology);

/**
 * PUT /api/v2/config/terminology
 * Update ticket terminology (admin only)
 */
router.put('/terminology', configController.updateTerminology);

/**
 * GET /api/v2/config/ticket-id-format
 * Get ticket ID format
 */
router.get('/ticket-id-format', configController.getTicketIdFormat);

/**
 * PUT /api/v2/config/ticket-id-format
 * Update ticket ID format (admin only)
 */
router.put('/ticket-id-format', configController.updateTicketIdFormat);

/**
 * GET /api/v2/config/presets
 * Get configuration presets
 */
router.get('/presets', configController.getPresets);

/**
 * POST /api/v2/config/presets/load
 * Load a preset configuration (admin only)
 */
router.post('/presets/load', configController.loadPreset);

/**
 * POST /api/v2/config/reset
 * Reset all configurations to defaults (admin only)
 */
router.post('/reset', configController.resetToDefaults);

module.exports = router;
