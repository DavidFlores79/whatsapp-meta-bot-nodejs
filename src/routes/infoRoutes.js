const express = require('express');
const healthController = require('../controllers/healthController');
const { authenticateToken } = require('../middleware/authMiddleware');
const router = express.Router();

// Service information endpoint — requires authentication (exposes internals)
router.get('/', authenticateToken, healthController.info);

module.exports = router;
