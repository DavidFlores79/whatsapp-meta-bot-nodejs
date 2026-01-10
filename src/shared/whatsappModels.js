
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

/**
 * Build JSON for image message using media ID
 * @param {string} number - Recipient phone number
 * @param {string} mediaId - WhatsApp media ID (from upload)
 * @param {string} caption - Optional caption for the image
 * @returns {string} JSON string for WhatsApp API
 */
const buildImageJSON = (number, mediaId, caption = '') => {
    const payload = {
        "messaging_product": "whatsapp",
        "to": number,
        "type": "image",
        "image": {
            "id": mediaId
        }
    };

    if (caption) {
        payload.image.caption = caption;
    }

    return JSON.stringify(payload);
}

/**
 * Build JSON for image message using URL
 * @param {string} number - Recipient phone number
 * @param {string} imageUrl - Public URL of the image
 * @param {string} caption - Optional caption for the image
 * @returns {string} JSON string for WhatsApp API
 */
const buildImageUrlJSON = (number, imageUrl, caption = '') => {
    const payload = {
        "messaging_product": "whatsapp",
        "to": number,
        "type": "image",
        "image": {
            "link": imageUrl
        }
    };

    if (caption) {
        payload.image.caption = caption;
    }

    return JSON.stringify(payload);
}

/**
 * Build JSON for document message using media ID
 * @param {string} number - Recipient phone number
 * @param {string} mediaId - WhatsApp media ID (from upload)
 * @param {string} filename - Display filename for the document
 * @param {string} caption - Optional caption for the document
 * @returns {string} JSON string for WhatsApp API
 */
const buildDocumentJSON = (number, mediaId, filename, caption = '') => {
    const payload = {
        "messaging_product": "whatsapp",
        "to": number,
        "type": "document",
        "document": {
            "id": mediaId,
            "filename": filename
        }
    };

    if (caption) {
        payload.document.caption = caption;
    }

    return JSON.stringify(payload);
}

/**
 * Build JSON for document message using URL
 * @param {string} number - Recipient phone number
 * @param {string} documentUrl - Public URL of the document
 * @param {string} filename - Display filename for the document
 * @param {string} caption - Optional caption for the document
 * @returns {string} JSON string for WhatsApp API
 */
const buildDocumentUrlJSON = (number, documentUrl, filename, caption = '') => {
    const payload = {
        "messaging_product": "whatsapp",
        "to": number,
        "type": "document",
        "document": {
            "link": documentUrl,
            "filename": filename
        }
    };

    if (caption) {
        payload.document.caption = caption;
    }

    return JSON.stringify(payload);
}

/**
 * Build JSON for video message using media ID
 * @param {string} number - Recipient phone number
 * @param {string} mediaId - WhatsApp media ID (from upload)
 * @param {string} caption - Optional caption for the video
 * @returns {string} JSON string for WhatsApp API
 */
const buildVideoJSON = (number, mediaId, caption = '') => {
    const payload = {
        "messaging_product": "whatsapp",
        "to": number,
        "type": "video",
        "video": {
            "id": mediaId
        }
    };

    if (caption) {
        payload.video.caption = caption;
    }

    return JSON.stringify(payload);
}

/**
 * Build JSON for audio message using media ID
 * @param {string} number - Recipient phone number
 * @param {string} mediaId - WhatsApp media ID (from upload)
 * @returns {string} JSON string for WhatsApp API
 */
const buildAudioJSON = (number, mediaId) => {
    return JSON.stringify({
        "messaging_product": "whatsapp",
        "to": number,
        "type": "audio",
        "audio": {
            "id": mediaId
        }
    });
}


module.exports = {
    buildTextJSON,
    buildTemplateJSON,
    buildReadWithTypingJSON,
    buildInteractiveButtonJSON,
    buildImageJSON,
    buildImageUrlJSON,
    buildDocumentJSON,
    buildDocumentUrlJSON,
    buildVideoJSON,
    buildAudioJSON,
}