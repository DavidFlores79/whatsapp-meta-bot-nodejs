const https = require('https');

const URI = process.env.WHATSAPP_URI;
const VERSION = process.env.WHATSAPP_VERSION
const PHONE_ID = process.env.WHATSAPP_PHONE_NUMBER_ID;
const TOKEN = process.env.WHATSAPP_API_TOKEN;

/**
 * Send any message or status to WhatsApp Cloud API
 * @param {string} data - JSON string payload to send
 */
const sendWhatsappResponse = (data) => {

    const options = {
        host: `${URI}`,
        path: `/${VERSION}/${PHONE_ID}/messages`,
        method: 'POST',
        body: data,
        headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${TOKEN}`,
        }
    };

    console.log({ options });

    const req = https.request(options, res => {
        res.on('data', data => {
            process.stdout.write(data);
        });
    });

    req.on('error', error => {
        console.error({ error });
    });

    req.write(data);
    req.end();
}

/**
 * Mark message as read and show typing indicator
 * @param {string} messageId - The message ID to mark as read
 * @param {string} typingType - The typing indicator type (default: 'text')
 */
const sendTypingIndicator = (messageId, typingType = 'text') => {
    const { buildReadWithTypingJSON } = require('../shared/whatsappModels');
    const data = buildReadWithTypingJSON(messageId, typingType);
    
    console.log(`Marking message ${messageId} as read and showing typing indicator`);
    
    // Reuse the main send method
    sendWhatsappResponse(data);
}



module.exports = {
    sendWhatsappResponse,
    sendTypingIndicator,
}