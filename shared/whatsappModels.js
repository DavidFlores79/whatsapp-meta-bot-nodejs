
const buildTextJSON = (textResponse, number) => {
    return JSON.stringify({
        "messaging_product": "whatsapp",
        "recipient_type": "individual",
        "to": number,
        "type": "text",
        "text": {
            "preview_url": true,
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
                "text": "Este es nuestro Menú!"
            },
            "footer" : {
                "text": "Por favor selecciona una opción para continuar"
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
                                "description": "Visítanos para agendar tu cita hoy mismo!",
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

const buildAppointmentListJSON = ( number, rows ) => {
    return JSON.stringify({
        "messaging_product": "whatsapp",
        "to": number,
        "type": "interactive",
        "interactive": {
            "type": "list",
            "body": {
                "text": "Se encontró más de una cita pendiente de CONFIRMAR en las proximas 24hrs."
            },
            "footer" : {
                "text": "Por favor, selecciona una cita de esta lista:"
            },
            "action": {
                "button": "CITAS",
                "sections": [
                    {
                        "title": "Citas NO Confirmadas",
                        "rows": rows,
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
            "name": "Clínica Hoper",
            "address": "Calle 44 por 27 y 17, Número 404, 97109 Mérida, Yuc."
        }
    });

}

const buildTemplateJSON = ( number, templateName, parameters ) => {

    return JSON.stringify({
        "messaging_product": "whatsapp",
        "to": `52${number}`,
        "type": "template",
        "template": {
            "name": templateName,
            "language": {
                "code": "es_MX"
            },
            "components": [
                {
                    "type": "body",
                    "parameters": parameters
                }
            ]
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
    buildAppointmentListJSON,
    buildTemplateJSON,
}