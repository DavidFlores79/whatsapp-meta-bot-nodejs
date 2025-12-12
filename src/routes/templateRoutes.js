const express = require('express');
const router = express.Router();
const templateController = require('../controllers/templateController');
const { authenticateToken } = require('../middleware/authMiddleware');

// All template routes require authentication
router.use(authenticateToken);

// Template management routes
router.post('/sync', templateController.syncTemplates);
router.get('/stats', templateController.getTemplateStats);
router.get('/', templateController.getTemplates);
router.get('/:id', templateController.getTemplateById);
router.put('/:id', templateController.updateTemplate);
router.delete('/:id', templateController.deleteTemplate);

// Template sending routes
router.post('/send', templateController.sendTemplateToCustomer);
router.post('/send-bulk', templateController.sendTemplateBulk);

module.exports = router;
