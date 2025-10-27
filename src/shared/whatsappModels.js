
const buildTextJSON = (number, text) => {
    return JSON.stringify({
        "messaging_product": "whatsapp",
        "to": number,
        "type": "text",
        "text": {
            "body": text
        }
    });
}

const buildTemplateJSON = ( number, templateName, parameters, language ) => {

    let components = [];
    if (parameters && parameters.length > 0) {
        components = [
            {
                "type": "body",
                "parameters": parameters
            }
        ];
    }

    return JSON.stringify({
        "messaging_product": "whatsapp",
        "to": number,
        "type": "template",
        "template": {
            "name": templateName,
            "language": {
                "code": language ? language : "en_US"
            },
            "components": components
        }
    });

}

/**
 * Build JSON for sending typing indicator (or marking as read)
 * @param {string} number - WhatsApp phone number
 * @param {string} action - 'typing' or 'mark_as_read'
 * @returns {string} JSON string for WhatsApp API
 */
const buildStatusJSON = (number, action = 'typing') => {
    return JSON.stringify({
        "messaging_product": "whatsapp",
        "to": number,
        "type": action
    });
}


module.exports = {
    buildTextJSON,
    buildTemplateJSON,
    buildStatusJSON,
}