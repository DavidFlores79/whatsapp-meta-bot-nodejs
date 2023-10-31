const fetch = require('node-fetch');
const fs = require('fs');
const myConsole = new console.Console(fs.createWriteStream('./logs.txt'));
const path = require('path');
const whatsappService = require('../services/whatsappService');
const { getLocationData, analizeText, getButtonsData, formatNumber, getTextData, getLast10Digits } = require('../shared/processMessage');
const { getAppointmentInfo, confirmAppointment } = require('../services/appointmentService');
const { buildAppointmentListJSON, buildTemplateJSON } = require('../shared/whatsappModels');
const Constants = require('../shared/constants');

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

                if (interactiveType == 'button_reply') buttonReplyActions(messageObject);
                if (interactiveType == 'list_reply') listReplyActions(messageObject);

                break;
            //templates
            case 'button':
                console.log('es BUTTON');
                buttonActions(messageObject);
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

const appointmentConfirmMessage = async (phone) => {

    try {
        const apiResponse = await getAppointmentInfo(phone);

        if (apiResponse) {
            if (apiResponse.total > 1) {
                let rows = [];
                apiResponse.data.forEach(appointment => {
                    let row = {
                        id: `009-${appointment.id}`,
                        title: `Cita: ${appointment.type}`,
                        description: `Médico: ${appointment.doctor.name} ${appointment.doctor.last_name}.\nFecha: ${appointment.scheduled_date} a las ${appointment.scheduled_time}`,
                    }
                    rows.push(row);
                });
                data = buildAppointmentListJSON(phone, rows);
                whatsappService.sendWhatsappResponse(data);
            } else {
                // data = getTextData(`${apiResponse.message}`, phone);
                const appointment = apiResponse.data[0];

                data = getButtonsData(phone, {
                    // Tiene una cita con *Dra. Nayli Hoil* el día *mañana 27 de Octubre de 2023* a las *5:00 p.m.* Desea confirmarla?
                    bodyTitle: `Tiene una cita con *${appointment.doctor.name} ${appointment.doctor.last_name}* el día *${appointment.scheduled_date}* a las *${appointment.scheduled_time}*.\n\n¿Desea confirmar su cita?`,
                    button1Label: "✔️ Si",
                    button1Id: `009-${appointment.id}`,
                    button2Label: "❌ No",
                    button2Id: `010-${appointment.id}`,
                });
                whatsappService.sendWhatsappResponse(data);
            }
        }


    } catch (error) {
        // Handle the error, for example, send an error message to the client
        // data = getTextData(`Ocurrió Error: ${error}`, phone);
        console.log({ error });
    }
}

const appointmentReminder = async (req, res) => {

    const { data } = req.body;
    const { number, template_name, parameters } = data;

    console.log({ number, template_name, parameters });

    try {
        let templateData = buildTemplateJSON(number, template_name, parameters);
        whatsappService.sendWhatsappResponse(templateData);

        return res.send({ msg: 'Template Enviado correctamente.', data });
    } catch (error) {
        return res.status(400).send({ msg: error, data });
    }


}

const listReplyActions = async (messageObject) => {

    const { list_reply: listReply } = messageObject.interactive;
    let number = messageObject.from;
    // Verificar que el número tenga 11 dígitos
    if (number.length == 13) {
        number = formatNumber(number);
    };

    console.log('List Reply id!!', listReply.id);
    console.log('List Reply text!!', listReply.title);

    let listId = '000';
    let appointmentId = null;

    if (listReply.id.length != 3) {
        listId = listReply.id.split('-')[0];
        appointmentId = listReply.id.split('-')[1];
    } else {
        listId = listReply.id;
    }
    console.log({ listId });

    switch (listId) {
        case '005':
            console.log(`Entró en ${listId}`);
            data = getLocationData(number);
            whatsappService.sendWhatsappResponse(data);
            break;
        case '006': //Menu -> Confirmar Cita
            console.log(`Entró en ${listId}`);
            appointmentConfirmMessage(number)
            break;
        case '009':
            //Si entra aqui es porque ya tiene un ID de cita para poder hacer la peticion al Backend
            console.log(`Entró en ${listId}`);
            const apiResponse = await confirmAppointment(appointmentId);
            if (apiResponse) {
                data = getTextData(`${apiResponse.message}`, number);
                whatsappService.sendWhatsappResponse(data);
            }
            break;
        default:
            data = getTextData(Constants.UnknownOption, number);
            whatsappService.sendWhatsappResponse(data);
            break;
    }

}
const buttonReplyActions = async (messageObject) => {

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
    let data = {};

    if (buttonReply.id.length != 3) {
        buttonId = buttonReply.id.split('-')[0];
        appointmentId = buttonReply.id.split('-')[1];
    } else {
        buttonId = buttonReply.id;
    }
    console.log('*************** button ID ******************');
    console.log({ buttonId });
    console.log({ number });

    switch (buttonId) {
        case '009':
            //Si entra aqui es porque ya tiene un ID de cita para poder hacer la peticion al Backend
            console.log(`Entró en ${buttonId}`);
            const apiResponse = await confirmAppointment(appointmentId);
            if (apiResponse) {
                data = getTextData(`${apiResponse.message}`, number);
                whatsappService.sendWhatsappResponse(data);
            }
            break;
        case '010':
            //Escogio NO a la pregunta de si desea confirmar la cita y se debera preguntar el MOTIVO DE CANCELACION
            console.log(`Entró en ${buttonId}`);
            data = getTextData(Constants.ConfirmNO, messageObject.from);
            whatsappService.sendWhatsappResponse(data);
            break;
        default:
            data = getTextData(Constants.UnknownOption, number);
            whatsappService.sendWhatsappResponse(data);
            break;
    }
}

const buttonActions = async (messageObject) => {
    const buttonPayload = messageObject.button.payload;
    console.log('Button Payload',);

    switch (buttonPayload) {
        case 'SI':
            console.log(`Eligió ${buttonPayload} - Template`);
            appointmentConfirmMessage(messageObject.from);
            break;
        case 'NO':
            console.log(`Eligió ${buttonPayload} - Template`);
            data = getTextData(Constants.ConfirmNO, messageObject.from);
            whatsappService.sendWhatsappResponse(data);
            break;
        case 'Confirmar':
            console.log(`Eligió ${buttonPayload} - Template`);
            appointmentConfirmMessage(messageObject.from);
            whatsappService.sendWhatsappResponse(data);
            break;
        case 'Cancelar':
            console.log(`Eligió ${buttonPayload} - Template`);
            data = getTextData(Constants.ConfirmNO, messageObject.from);
            whatsappService.sendWhatsappResponse(data);
            break;
        default:
            data = getTextData(Constants.UnknownOption, number);
            whatsappService.sendWhatsappResponse(data);
            break;
    }
}

const verifyPhoneNumber = async (number, buttonIds) => {
    data = getButtonsData(number, {
        bodyTitle: `Su número de Teléfono es: *${getLast10Digits(number)}*?`,
        button1Label: "✔️ Si",
        button1Id: buttonIds[0],
        button2Label: "No ❌",
        button2Id: buttonIds[1],
    });
    whatsappService.sendWhatsappResponse(data);
}

const uploadFile = async (req, res) => {

    const files = req.files;
    const img_path = files.file.path;
    const img_name = img_path.split('/')[1];
    const url = `https://whatsapp-meta-bot-nodejs-production.up.railway.app//api/v1/get_resource/${img_name}`;
    // const img_name = img_path.split('\\')[1];
    // const url = `http://127.0.0.1:${process.env.PORT ?? 5000}/api/v1/get_resource/${img_name}`;


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
    appointmentReminder,
}