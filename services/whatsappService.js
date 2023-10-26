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

const getTextData = (textResponse, number, type) => {

    // Verificar que el número tenga 11 dígitos
    if (number.length == 13) {
        number = formatNumber(number);
    };

    const greetings = ['hola', 'hi', 'hello', 'buenas', 'buenas tardes', 'buenas noches', 'buenos días', 'buenos dias'];
    const farewells = ['adios', 'bye', 'hasta pronto', 'adiós', 'nos vemos'];
    const thanks = ['gracias', 'thank you', 'thanks'];

    if (includeStrings(textResponse, greetings)) {
        textResponse = 'Bienvenido a Clínica Hoper, en que puedo servirle.';
    }

    if (includeStrings(textResponse, farewells)) {
        textResponse = 'Fue un placer servirle. Hasta pronto 😁';
    }

    if (includeStrings(textResponse, thanks)) {
        textResponse = 'De nada 😁';
    }

    const dataObject = JSON.stringify({
        "messaging_product": "whatsapp",
        "recipient_type": "individual",
        "to": number,
        "type": type,
        "text": {
            "preview_url": false,
            "body": textResponse
        }
    });

    console.log({ dataObject });

    return dataObject;
}

const formatNumber = (numero) => {

    // Verificar que comience con "521"
    if (!numero.startsWith('521')) {
        return 'Número de teléfono no válido';
    }

    // Formatear el número con "52" en lugar de "521"
    const numeroFormateado = `52${numero.slice(3)}`;

    return numeroFormateado;
}

const includeStrings = (texto, arrayDeCadenas) => {
    // Utiliza Array.some() para verificar si alguna cadena del array está incluida en el texto
    return arrayDeCadenas.some(cadena => texto.includes(cadena));
}

module.exports = {
    sendWhatsappResponse,
}