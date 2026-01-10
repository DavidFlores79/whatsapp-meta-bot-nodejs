const https = require('https');
const FormData = require('form-data');
const fs = require('fs');
const path = require('path');

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

/**
 * Get media URL from WhatsApp using media ID
 * @param {string} mediaId - The media ID from WhatsApp webhook
 * @returns {Promise<string>} - The media URL (expires in a few minutes)
 */
const getMediaUrl = async (mediaId) => {
    return new Promise((resolve, reject) => {
        const options = {
            host: URI,
            path: `/${VERSION}/${mediaId}`,
            method: 'GET',
            headers: {
                'Authorization': `Bearer ${TOKEN}`,
            }
        };

        console.log(`Getting media URL for ID: ${mediaId}`);

        const req = https.request(options, res => {
            let data = '';
            
            res.on('data', chunk => {
                data += chunk;
            });

            res.on('end', () => {
                try {
                    const response = JSON.parse(data);
                    if (response.url) {
                        console.log(`Media URL retrieved: ${response.url}`);
                        resolve(response.url);
                    } else {
                        console.error('No URL in media response:', response);
                        reject(new Error('No URL in media response'));
                    }
                } catch (error) {
                    console.error('Error parsing media response:', error);
                    reject(error);
                }
            });
        });

        req.on('error', error => {
            console.error('Error getting media URL:', error);
            reject(error);
        });

        req.end();
    });
}

/**
 * Upload media to WhatsApp Cloud API
 * @param {Buffer} fileBuffer - File buffer to upload
 * @param {string} mimeType - MIME type of the file (e.g., 'image/jpeg', 'application/pdf')
 * @param {string} filename - Original filename
 * @returns {Promise<string>} - WhatsApp media ID
 */
const uploadMedia = async (fileBuffer, mimeType, filename) => {
    return new Promise((resolve, reject) => {
        const form = new FormData();
        form.append('messaging_product', 'whatsapp');
        form.append('file', fileBuffer, {
            filename: filename,
            contentType: mimeType
        });
        form.append('type', mimeType);

        const options = {
            host: URI,
            path: `/${VERSION}/${PHONE_ID}/media`,
            method: 'POST',
            headers: {
                ...form.getHeaders(),
                'Authorization': `Bearer ${TOKEN}`,
            }
        };

        console.log(`Uploading media: ${filename} (${mimeType})`);

        const req = https.request(options, res => {
            let data = '';

            res.on('data', chunk => {
                data += chunk;
            });

            res.on('end', () => {
                try {
                    const response = JSON.parse(data);
                    if (response.id) {
                        console.log(`Media uploaded successfully: ${response.id}`);
                        resolve(response.id);
                    } else {
                        console.error('No media ID in response:', response);
                        reject(new Error(response.error?.message || 'Failed to upload media'));
                    }
                } catch (error) {
                    console.error('Error parsing upload response:', error);
                    reject(error);
                }
            });
        });

        req.on('error', error => {
            console.error('Error uploading media:', error);
            reject(error);
        });

        form.pipe(req);
    });
}

/**
 * Upload media from file path
 * @param {string} filePath - Path to the file
 * @param {string} mimeType - MIME type of the file
 * @returns {Promise<string>} - WhatsApp media ID
 */
const uploadMediaFromPath = async (filePath, mimeType) => {
    const fileBuffer = fs.readFileSync(filePath);
    const filename = path.basename(filePath);
    return uploadMedia(fileBuffer, mimeType, filename);
}

/**
 * Get MIME type category for WhatsApp message type
 * @param {string} mimeType - MIME type string
 * @returns {string} - WhatsApp message type (image, document, video, audio)
 */
const getMediaTypeFromMime = (mimeType) => {
    if (mimeType.startsWith('image/')) return 'image';
    if (mimeType.startsWith('video/')) return 'video';
    if (mimeType.startsWith('audio/')) return 'audio';
    return 'document';
}

module.exports = {
    sendWhatsappResponse,
    sendTypingIndicator,
    getMediaUrl,
    uploadMedia,
    uploadMediaFromPath,
    getMediaTypeFromMime,
}