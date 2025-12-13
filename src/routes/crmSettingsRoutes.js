const express = require('express');
const router = express.Router();
const { authenticateToken, requireRole } = require('../middleware/authMiddleware');
const crmSettingsController = require('../controllers/crmSettingsController');

/**
 * CRM Settings Routes
 * All routes require authentication and admin/supervisor role
 */

// Get current CRM settings
router.get('/', authenticateToken, requireRole('admin', 'supervisor'), crmSettingsController.getSettings);

// Update CRM settings
router.put('/', authenticateToken, requireRole('admin', 'supervisor'), crmSettingsController.updateSettings);

// Reset to defaults
router.post('/reset', authenticateToken, requireRole('admin', 'supervisor'), crmSettingsController.resetToDefaults);

module.exports = router;
