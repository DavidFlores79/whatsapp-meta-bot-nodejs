
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
 * Build JSON for marking message as read with typing indicator
 * @param {string} messageId - The message ID to mark as read
 * @param {string} typingType - The typing indicator type (default: 'text')
 * @returns {string} JSON string for WhatsApp API
 */
const buildReadWithTypingJSON = (messageId, typingType = 'text') => {
    return JSON.stringify({
        "messaging_product": "whatsapp",
        "status": "read",
        "message_id": messageId,
        "typing_indicator": {
            "type": typingType
        }
    });
}

/**
 * Build JSON for interactive button message
 * @param {string} number - Recipient phone number
 * @param {string} bodyText - Message body text
 * @param {Array} buttons - Array of buttons [{id, title}] (max 3 buttons)
 * @returns {string} JSON string for WhatsApp API
 */
const buildInteractiveButtonJSON = (number, bodyText, buttons) => {
    // WhatsApp allows max 3 buttons
    const limitedButtons = buttons.slice(0, 3);

    return JSON.stringify({
        "messaging_product": "whatsapp",
        "to": number,
        "type": "interactive",
        "interactive": {
            "type": "button",
            "body": {
                "text": bodyText
            },
            "action": {
                "buttons": limitedButtons.map(btn => ({
                    "type": "reply",
                    "reply": {
                        "id": btn.id,
                        "title": btn.title
                    }
                }))
            }
        }
    });
}


module.exports = {
    buildTextJSON,
    buildTemplateJSON,
    buildReadWithTypingJSON,
    buildInteractiveButtonJSON,
}