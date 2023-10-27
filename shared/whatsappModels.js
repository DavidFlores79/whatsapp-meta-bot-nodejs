
const buildTextJSON = (textResponse, number) => {
    return JSON.stringify({
        "messaging_product": "whatsapp",
        "recipient_type": "individual",
        "to": number,
        "type": "text",
        "text": {
            "preview_url": false,
            "body": textResponse
        }
    })
}

module.exports = {
    buildTextJSON,

}