
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

const buildListJSON = ( number ) => {
    return JSON.stringify({
        "messaging_product": "whatsapp",
        // "recipient_type": "individual",
        "to": number,
        "type": "interactive",
        "interactive": {
            "type": "list",
            "body": {
                "text": "Estas opciones pueden ayudarte!"
            },
            "footer" : {
                "text": "Selecciona una para continuar atendiéndole:"
            },
            "action": {
                "button": "Ver Opciones",
                "sections": [
                    {
                        "title": "Citas Médicas",
                        "rows": [
                            {
                                "id": "005",
                                "title": "Ubicación de la Clínica",
                                "description": "Siga unos sencillos pasos para agendar su cita hoy mismo!",
                            },
                            {
                                "id": "006",
                                "title": "Confirmar Cita",
                                "description": "Tienes una cita en las próximas 24 horas? Confírmala ya!!",
                            },
                        ],
                    },
                ],
            }
        }
    })
}

const buildLocationJSON = ( number ) => {

    return JSON.stringify({
        "messaging_product": "whatsapp",
        "recipient_type": "individual",
        "to": number,
        "type": "location",
        "location": {
            "latitude": "20.988600256807224",
            "longitude" : "-89.60911081895594",
            "name": "Clinica Hoper",
            "address": "Calle 44 por 27 y 17, Número 404, 97109 Mérida, Yuc."
        }
    });

}

const buildButtonsJSON = (number, { bodyTitle, button1Label, button1Id, button2Label, button2Id }) => {

    return JSON.stringify({
        "messaging_product": "whatsapp",
        "recipient_type": "individual",
        "to": number,
        "type": "interactive",
        "interactive": {
            "type": "button",
            "body": {
                "text": bodyTitle
            },
            "action": {
                "buttons": [
                    {
                        "type": "reply",
                        "reply": {
                            "id": button1Id,
                            "title": button1Label
                        }
                    },
                    {
                        "type": "reply",
                        "reply": {
                            "id": button2Id,
                            "title": button2Label
                        }
                    }
                ]
            }
        }
    });
}

module.exports = {
    buildTextJSON,
    buildListJSON,
    buildLocationJSON,
    buildButtonsJSON,
}