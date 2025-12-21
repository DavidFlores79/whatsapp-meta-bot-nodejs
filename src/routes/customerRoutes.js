const express = require('express');
const router = express.Router();
const multer = require('multer');
const customerController = require('../controllers/customerController');
const { authenticateToken } = require('../middleware/authMiddleware');

// Configure multer for file uploads (memory storage)
const upload = multer({
    storage: multer.memoryStorage(),
    limits: {
        fileSize: 5 * 1024 * 1024 // 5MB max file size
    },
    fileFilter: (req, file, cb) => {
        // Accept only Excel and CSV files
        const allowedMimes = [
            'application/vnd.ms-excel',
            'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
            'text/csv'
        ];
        
        if (allowedMimes.includes(file.mimetype) || 
            file.originalname.match(/\.(xlsx|xls|csv)$/i)) {
            cb(null, true);
        } else {
            cb(new Error('Only XLSX, XLS, and CSV files are allowed'));
        }
    }
});

// All customer routes require authentication
router.use(authenticateToken);

/**
 * Customer CRUD Operations (Standard CRM)
 */

// List customers with pagination, search, and filters
router.get('/', customerController.listCustomers);

// Get customer statistics for dashboard
router.get('/stats/summary', customerController.getCustomerStats);

// Download import template (XLSX with instructions)
router.get('/template', customerController.downloadImportTemplate);

// Export customers (XLSX/CSV)
router.get('/export', customerController.exportCustomers);

// Bulk import customers from XLSX/CSV file
router.post('/bulk/import', upload.single('file'), customerController.bulkImportCustomers);

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

// Get customer tickets
router.get('/:customerId/tickets', require('../controllers/ticketController').getCustomerTickets);

module.exports = router;
