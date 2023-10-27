const { buildTextJSON, buildListJSON, buildLocationJSON } = require("../shared/whatsappModels");
const whatsappService = require('../services/whatsappService');

const getTextData = (textResponse, number) => {

    // Verificar que el número tenga 11 dígitos
    if (number.length == 13) {
        number = formatNumber(number);
    };

    // textResponse = analizeText(userRequest, number);

    const dataObject = buildTextJSON(textResponse, number);

    console.log({ dataObject });

    return dataObject;
}

const getListData = (number) => {

    // Verificar que el número tenga 11 dígitos
    if (number.length == 13) {
        number = formatNumber(number);
    };

    const dataObject = buildListJSON(number);

    return dataObject;
}

const getLocationData = (number) => {

    // Verificar que el número tenga 11 dígitos
    if (number.length == 13) {
        number = formatNumber(number);
    };

    const dataObject = buildLocationJSON(number);

    return dataObject;
}

const formatNumber = (numero) => {

    // Formatear el número con "52" en lugar de "521"
    const numeroFormateado = `52${numero.slice(3)}`;

    return numeroFormateado;
}

const analizeText = (userRequest, number) => {

    const greetings = ['hola', 'hi', 'hello', 'buenas', 'buenas tardes', 'buenas noches', 'buenos días', 'buenos dias'];
    const farewells = ['adios', 'bye', 'hasta pronto', 'adiós', 'nos vemos'];
    const thanks = ['gracias', 'thank you', 'thanks', 'grax'];
    let textResponse = `No entendí el mensaje: *${userRequest}*`;
    let dataModels = [];


    if (includeStrings(userRequest.toLowerCase(), greetings)) {
        textResponse = 'Gracias por comunicarse a *Clínica Hoper* ¿Cómo podemos ayudarle? le recordamos que por este medio la atención es sólo por mensajes, no llamadas.';
        console.log(textResponse);
        listModel = getListData(number);
        dataModels.push(listModel);
        textModel = getTextData(textResponse, number);
        dataModels.push(textModel);

    }

    if (includeStrings(userRequest.toLowerCase(), farewells)) {
        textResponse = 'Fue un placer poder servirle. Hasta pronto 😁';
        textModel = getTextData(textResponse, number);
        dataModels.push(textModel);
    }

    if (includeStrings(userRequest.toLowerCase(), thanks)) {
        textResponse = 'De nada 😁';
        textModel = getTextData(textResponse, number);
        dataModels.push(textModel);
    }

    dataModels.forEach(data => {
        whatsappService.sendWhatsappResponse(data);
    });

    // return textResponse;

}

const includeStrings = (texto, arrayDeCadenas) => {
    // Utiliza Array.some() para verificar si alguna cadena del array está incluida en el texto
    return arrayDeCadenas.some(cadena => texto.includes(cadena));
}

module.exports = {
    getTextData,
    getListData,
    getLocationData,
    analizeText,
}