const express = require('express');
const router = express.Router();
const customerController = require('../controllers/customerController');
const { authenticateToken } = require('../middleware/authMiddleware');

// All customer routes require authentication
router.use(authenticateToken);

/**
 * Customer CRUD Operations (Standard CRM)
 */

// List customers with pagination, search, and filters
router.get('/', customerController.listCustomers);

// Get customer statistics for dashboard
router.get('/stats/summary', customerController.getCustomerStats);

// Export customers (CSV/JSON)
router.get('/export', customerController.exportCustomers);

// Bulk import customers
router.post('/bulk/import', customerController.bulkImportCustomers);

// Get specific customer details
router.get('/:id', customerController.getCustomer);

// Create new customer
router.post('/', customerController.createCustomer);

// Update customer (full edit)
router.put('/:id', customerController.updateCustomer);

// Update customer tags (segmentation)
router.patch('/:id/tags', customerController.updateCustomerTags);

// Block/unblock customer
router.patch('/:id/block', customerController.toggleBlockCustomer);

// Delete customer (soft delete by default)
router.delete('/:id', customerController.deleteCustomer);

// Get customer conversations
router.get('/:id/conversations', customerController.getCustomerConversations);

module.exports = router;
