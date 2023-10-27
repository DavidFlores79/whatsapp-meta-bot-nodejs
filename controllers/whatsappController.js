const fetch = require('node-fetch');
const fs = require('fs');
const myConsole = new console.Console(fs.createWriteStream('./logs.txt'));
const path = require('path');
const whatsappService = require('../services/whatsappService');

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

const receivedMessage = (req, res) => {

    try {
            const { entry } = req.body;
            if(!entry) {
                console.log('******** NO ENTRY ********', req.body);
                return res.send('EVENT_RECEIVED');
            }
            const { changes } = entry[0];
            const { value } = changes[0];
            const { messages, errors, statuses, metadata } = value;

            if(!messages) {
                console.log('******** SERVER ********', changes[0].metadata);
                return res.send('EVENT_RECEIVED');
            }
            const messageObject = messages[0];
            const messageType = messageObject.type;

        switch (messageType) {
            case 'text':
                console.log('es TEXT');
                const userRequest = messageObject.text.body;
                // console.log({messageObject});
                whatsappService.sendWhatsappResponse(userRequest, messageObject.from, messageType);
                break;
            case 'interactive':
                console.log('es INTERACTIVE');
                const { type: interactiveType } = messageObject.interactive;

                if (interactiveType == 'button_reply') {
                    const { button_reply: buttonReply } = messageObject.interactive;
                    console.log('Button Reply id!!', buttonReply.id);
                    console.log('Button Reply text!!', buttonReply.title);
                }

                if (interactiveType == 'list_reply') {
                    const { list_reply: listReply } = messageObject.interactive;
                    console.log('List Reply id!!', listReply.id);
                    console.log('List Reply text!!', listReply.title);
                }

                break;

            default:
                console.log('Entró al default!! Tipo: ', messageType);
                break;
        }

        myConsole.log(messageObject);

        return res.send('EVENT_RECEIVED');



    } catch (error) {
        console.log({ error });
        return res.send('EVENT_RECEIVED');
    }
}

const uploadFile = async (req, res) => {

    const files = req.files;
    const img_path = files.file.path;
    // const img_name = img_path.split('/')[1];
    // const url=`https://whatsapp-api-bot-nodejs-production.up.railway.app/api/v1/get_resource/${img_name}`;
    const img_name = img_path.split('\\')[1];
    const url = `http://127.0.0.1:${process.env.PORT ?? 5000}/api/v1/get_resource/${img_name}`;


    console.log({ files });

    res.status(200).send({ data: url });
}

const getResource = async (req, res) => {

    const name = req.params['name'];
    // console.log({name});
    fs.stat(`./uploads/${name}`, (err) => {
        if (err) {
            let path_img = './uploads/default.png';
            return res.status(200).sendFile(path.resolve(path_img));
        }

        let path_img = `./uploads/${name}`;
        res.status(200).sendFile(path.resolve(path_img));
    });


}



module.exports = {
    verifyToken,
    receivedMessage,
    uploadFile,
    getResource,
}