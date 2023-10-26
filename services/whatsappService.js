const https = require('https');

const URI = process.env.WHATSAPP_URI;
const VERSION = process.env.WHATSAPP_VERSION
const PHONE_ID = process.env.WHATSAPP_PHONE_NUMBER_ID;
const TOKEN = process.env.WHATSAPP_API_TOKEN;

const sendWhatsappResponse = (userRequest = '', number, type) => {

    let data = {};

    switch (type) {
        case 'text':
            let textResponse = userRequest.toLowerCase();
            data = getTextData(textResponse, number, type);
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

    console.log({options});

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

const getTextData = (textResponse, number, type) => {

    let dataObject = {};

    if(textResponse.includes('hola','hi', 'hello', 'buenas', 'buenas tardes', 'buenas noches', 'buenos días', 'buenos dias')) {
        textResponse = 'Bienvenido a Clínica Hoper, en que puedo servirle.'
    }

    dataObject = JSON.stringify({
        "messaging_product": "whatsapp",
        "recipient_type": "individual",
        "to": number,
        "type": type,
        "text": {
            "preview_url": false,
            "body": textResponse
        }
    });

    console.log({dataObject});

    return dataObject;
}

module.exports = {
    sendWhatsappResponse,
}