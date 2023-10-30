const fetch = require('node-fetch');
const fs = require('fs');
const myConsole = new console.Console(fs.createWriteStream('./logs.txt'));
const path = require('path');
const whatsappService = require('../services/whatsappService');
const { getLocationData, analizeText, getButtonsData, formatNumber, getTextData } = require('../shared/processMessage');
const { getAppointmentInfo } = require('../services/appointmentService');

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
            case 'text':
                console.log('es TEXT');
                const userRequest = messageObject.text.body;
                let number = messageObject.from;
                analizeText(userRequest, number);
                break;
            case 'interactive':
                console.log('es INTERACTIVE');
                const { type: interactiveType } = messageObject.interactive;

                if (interactiveType == 'button_reply') {
                    const { button_reply: buttonReply } = messageObject.interactive;
                    let number = messageObject.from;
                    // Verificar que el número tenga 11 dígitos
                    if (number.length == 13) {
                        number = formatNumber(number);
                    };

                    console.log('Button Reply id!!', buttonReply.id);
                    console.log('Button Reply text!!', buttonReply.title);

                    let buttonId = '000';
                    let appointmentId = null;

                    if(buttonReply.id.length != 3){
                        buttonId = inputString.split('-')[0];
                        appointmentId = inputString.split('-')[1];
                    } else {
                        buttonId = buttonReply.id;
                    }
                    console.log('*************** button ID ******************');
                    console.log({buttonId});
                    
                    switch (buttonId) {
                        case '007':
                            console.log(`Entró en ${buttonId}`);
                            appointmentConfirmMessage(number);
                            // data = getTextData('Se hace la petición API y la Cita ha sido *CONFIRMADA*!! ✨✨✨🖖', number);
                            // whatsappService.sendWhatsappResponse(data);
                            break;
                        case '008':
                            console.log(`Entró en ${buttonId}`);
                            data = getTextData('**** Este número No está registrado en nuestro Sistema 😭', number);
                            whatsappService.sendWhatsappResponse(data);
                            break;
                        case '009':
                            console.log(`Entró en ${buttonId}`);
                            data = getTextData('Se hace la petición API y la Cita ha sido *CONFIRMADA*!! ✨✨✨🖖', number);
                            whatsappService.sendWhatsappResponse(data);
                            break;
                        case '010':
                            console.log(`Entró en ${buttonId}`);
                            data = getTextData('Deberá escribir al motivo de la cancelación.', number);
                            whatsappService.sendWhatsappResponse(data);
                            break;
                        default:
                            data = getTextData('Opción Desconocida!! ☠', number);
                            whatsappService.sendWhatsappResponse(data);
                            break;
                    }
                }

                if (interactiveType == 'list_reply') {
                    const { list_reply: listReply } = messageObject.interactive;
                    let number = messageObject.from;
                    // Verificar que el número tenga 11 dígitos
                    if (number.length == 13) {
                        number = formatNumber(number);
                    };

                    console.log('List Reply id!!', listReply.id);
                    console.log('List Reply text!!', listReply.title);

                    switch (listReply.id) {
                        case '005':
                            data = getLocationData(number);
                            whatsappService.sendWhatsappResponse(data);
                            break;
                        case '006':
                            data = getButtonsData(number, {
                                bodyTitle: `Su número de Teléfono es: *${number}*?`,
                                button1Label: "✔️ Si",
                                button1Id: '007',
                                button2Label: "No ❌",
                                button2Id: '008',
                            });
                            whatsappService.sendWhatsappResponse(data);
                            break;
                        default:
                            data = getTextData('Opción Desconocida!! ☠', number);
                            whatsappService.sendWhatsappResponse(data);
                            break;
                    }
                }

                break;
            //templates
            case 'button':
                console.log('es BUTTON');
                switch (messageObject.button.payload) {
                    case 'Confirmar':
                        console.log(`Eligió Confirmar - Template`);
                        data = getTextData('Gracias por confirmar su cita.', messageObject.from);
                        whatsappService.sendWhatsappResponse(data);
                        break;
                    case 'Cancelar':
                        console.log(`Eligió Cancelar - Template`);
                        data = getTextData('Deberá escribir al motivo de la cancelación.', messageObject.from);
                        whatsappService.sendWhatsappResponse(data);
                        break;
                    default:
                        break;
                }
                break;
            default:
                console.log({ messageObject });
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

const appointmentInfo = async (req, res) => {

    const { phone } = req.body;

    try {
        const apiResponse = await getAppointmentInfo(phone);

        console.log( apiResponse );

        if(apiResponse.total != 1) {
            data = getTextData(`Se encontraron ${apiResponse.total} citas no Confirmadas. Validar.`, phone);
            whatsappService.sendWhatsappResponse(data);
        } else {
            // data = getTextData(`${apiResponse.message}`, phone);
            const appointment = apiResponse.data[0];

            data = getButtonsData(phone, {
                // Tiene una cita con *Dra. Nayli Hoil* el día *mañana 27 de Octubre de 2023* a las *5:00 p.m.* Desea confirmarla?
                bodyTitle: `¿Desea confirmar su cita?`,
                button1Label: "✔️ Si",
                button1Id: `009-${appointment.id}`,
                button2Label: "❌ No",
                button2Id: `010-${appointment.id}`,
            });
            whatsappService.sendWhatsappResponse(data);
        }


        return res.send({
            msg: 'Info Funciona!! ***',
            phone: phone,
        })

    } catch (error) {
        // Handle the error, for example, send an error message to the client
        // data = getTextData(`Ocurrió Error: ${error}`, phone);
        console.log({error});
    }
}

const appointmentConfirmMessage = async ( phone ) => {

    try {
        const apiResponse = await getAppointmentInfo(phone);

        console.log( apiResponse );

        if(apiResponse.total != 1) {
            data = getTextData(`Se encontraron ${apiResponse.total} citas no Confirmadas. Validar.`, phone);
            whatsappService.sendWhatsappResponse(data);
        } else {
            // data = getTextData(`${apiResponse.message}`, phone);
            const appointment = apiResponse.data[0];

            data = getButtonsData(phone, {
                // Tiene una cita con *Dra. Nayli Hoil* el día *mañana 27 de Octubre de 2023* a las *5:00 p.m.* Desea confirmarla?
                bodyTitle: `¿Desea confirmar su cita?`,
                button1Label: "✔️ Si",
                button1Id: `009-${appointment.id}`,
                button2Label: "❌ No",
                button2Id: `010-${appointment.id}`,
            });
            whatsappService.sendWhatsappResponse(data);
        }

    } catch (error) {
        // Handle the error, for example, send an error message to the client
        // data = getTextData(`Ocurrió Error: ${error}`, phone);
        console.log({error});
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
    appointmentInfo,
}