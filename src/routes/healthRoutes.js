const express = require('express');
const healthController = require('../controllers/healthController');
const router = express.Router();

// Health check endpoint - comprehensive health status
router.get('/', healthController.healthCheck);

// Kubernetes/Docker readiness probe
router.get('/ready', healthController.readiness);

// Kubernetes/Docker liveness probe
router.get('/live', healthController.liveness);

module.exports = router;
