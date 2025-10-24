
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


module.exports = {
    buildTextJSON,
    buildTemplateJSON,
}