const express = require('express');
const whatsappController = require('../controllers/whatsappController');
const router = express.Router();
const multiparty = require('connect-multiparty');
const path = multiparty({uploadDir: './uploads'});

router
.get('/', whatsappController.verifyToken)
.post('/', whatsappController.receivedMessage)
.post('/info', whatsappController.appointmentInfo);

module.exports = router;

