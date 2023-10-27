const https = require('https');
const { getTextData } = require('../shared/processMessage');

const URI = process.env.WHATSAPP_URI;
const VERSION = process.env.WHATSAPP_VERSION
const PHONE_ID = process.env.WHATSAPP_PHONE_NUMBER_ID;
const TOKEN = process.env.WHATSAPP_API_TOKEN;

const sendWhatsappResponse = (userRequest = '', number, type) => {

    let data = {};

    switch (type) {
        case 'text':
            // let textResponse = userRequest.toLowerCase();
            data = getTextData(userRequest, number);
            break;

        default:
            break;
    }

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



module.exports = {
    sendWhatsappResponse,
}