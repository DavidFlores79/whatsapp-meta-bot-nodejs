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
 * Send typing indicator or read status to user
 * Convenience wrapper around sendWhatsappResponse for status actions
 * @param {string} number - WhatsApp phone number
 * @param {string} action - 'typing' to show typing indicator, 'mark_as_read' to mark message as read
 */
const sendTypingIndicator = (number, action = 'typing') => {
    const { buildStatusJSON } = require('../shared/whatsappModels');
    const data = buildStatusJSON(number, action);
    
    console.log(`Sending ${action} indicator to ${number}`);
    
    // Reuse the main send method
    sendWhatsappResponse(data);
}



module.exports = {
    sendWhatsappResponse,
    sendTypingIndicator,
}