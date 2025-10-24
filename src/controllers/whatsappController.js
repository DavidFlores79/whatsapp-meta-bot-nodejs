const fetch = require('node-fetch');
const openaiService = require('../services/openaiService');
const fs = require('fs');
const whatsappService = require('../services/whatsappService');
const { analizeText, getTemplateData, formatNumber } = require('../shared/processMessage');
const ADMIN = process.env.WHATSAPP_ADMIN;

const verifyToken = (req, res) => {

    try {
        const accessToken = process.env.WHATSAPP_ACCESS_TOKEN;
        const token = req.query['hub.verify_token'];
        const challenge = req.query['hub.challenge'];

        console.log({ accessToken });
        console.log({ token });
        console.log({ challenge });

        if (challenge != null && token != null && accessToken == token) {
            return res.status(200).send(challenge);
        }

        return res.status(400).send({ msg: 'El Token no está presente. Validar.' });
    } catch (error) {
        return res.status(400).send();
    }

}

const receivedMessage = async (req, res) => {

    try {
        const { entry } = req.body;
        req.io.emit('incoming_messages', req.body);
        
        if (!entry) {
            console.log('******** NO ENTRY ********', req.body);
            return res.send('EVENT_RECEIVED');
        }
        const { changes } = entry[0];
        const { value } = changes[0];
        const { messages, errors, statuses, metadata } = value;

        if (!messages) {
            console.log('******** SERVER ********');
            console.log(JSON.stringify(changes[0]));
            return res.send('EVENT_RECEIVED');
        }
        const messageObject = messages[0];
        const messageType = messageObject.type;


        switch (messageType) {
            case 'text': {
                console.log('es TEXT');
                const userRequest = messageObject.text.body;
                let number = messageObject.from;
                
                // Format number if it has 13 digits (5219991992696 -> 529991992696)
                if (number.length === 13) {
                    number = formatNumber(number);
                }
                
                // Call OpenAI Assistant for AI response
                try {
                    const aiReply = await openaiService.getAIResponse(userRequest, number);
                    // Send AI reply back to user
                    const replyPayload = require('../shared/whatsappModels').buildTextJSON(number, aiReply);
                    whatsappService.sendWhatsappResponse(replyPayload);
                } catch (err) {
                    console.error('AI response error:', err);
                }
                // Optionally still run analizeText if needed for business logic
                // analizeText(userRequest, number);
                break;
            }
            case 'interactive': {
                console.log('es INTERACTIVE');
                const { type: interactiveType } = messageObject.interactive;
                break;
            }
            //templates
            case 'button': {
                console.log('es BUTTON');
                break;
            }
            default: {
                console.log({ messageObject });
                console.log('Entró al default!! Tipo: ', messageType);
                break;
            }
        }
        return res.send('EVENT_RECEIVED');

    } catch (error) {
        console.log({ error });
        return res.send('EVENT_RECEIVED');
    }
}

const sendTemplateData = async (req, res) => {

    const { data } = req.body;
    const { number, template_name, parameters, language } = data;

    console.log({ number, template_name, parameters, language });

    try {
        let templateData = getTemplateData(number, template_name, parameters, language);
        whatsappService.sendWhatsappResponse(templateData);
        // let adminMsg = getTextData(`Se envió el Template ${template_name} al Cel ${number}`, ADMIN);
        // whatsappService.sendWhatsappResponse(adminMsg);

        return res.send({ msg: 'Template Enviado correctamente.', data });
    } catch (error) {
        return res.status(400).send({ msg: error, data });
    }
}

module.exports = {
    verifyToken,
    receivedMessage,
    sendTemplateData,
}