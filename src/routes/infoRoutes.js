const express = require('express');
const healthController = require('../controllers/healthController');
const router = express.Router();

// Service information endpoint
router.get('/', healthController.info);

module.exports = router;
