const express = require('express');
const whatsappController = require('../controllers/whatsappController');
const router = express.Router();

router
.get('/', whatsappController.verifyToken)
.post('/', whatsappController.receivedMessage)
.post('/send', whatsappController.sendTemplateData);

module.exports = router;

