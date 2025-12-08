const express = require('express');
const whatsappController = require('../controllers/whatsappController');
const router = express.Router();

router
    .get('/', whatsappController.verifyToken)
    .post('/', whatsappController.receivedMessage)
    .post('/send', whatsappController.sendTemplateData)
    .post('/send', whatsappController.sendTemplateData)
    .post('/cleanup-thread', whatsappController.cleanupUserThread)
    .get('/conversations', whatsappController.getConversations)
    .get('/messages/:phoneNumber', whatsappController.getMessages);

module.exports = router;

