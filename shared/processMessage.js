const { buildTextJSON, buildListJSON, buildLocationJSON, buildButtonsJSON } = require("../shared/whatsappModels");
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

const getButtonsData = (number, buttonsJSON) => {

    // Verificar que el número tenga 11 dígitos
    if (number.length == 13) {
        number = formatNumber(number);
    };

    const dataObject = buildButtonsJSON(number, buttonsJSON);

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
    const menuList = ['menu', 'menú', 'lista', 'opciones'];
    let textResponse = `No entendí el mensaje: *${userRequest}*. Puedes escribir MENU para acceder a las opciones.`;
    let dataModels = [];


    if (includeStrings(userRequest.toLowerCase(), greetings)) {
        textResponse = 'Gracias por comunicarse a *Clínica Hoper* ¿Cómo podemos ayudarle? le recordamos que por este medio la atención es sólo por mensajes, no llamadas.';
        listModel = getListData(number);
        dataModels.push(listModel);
        textModel = getTextData(textResponse, number);
        dataModels.push(textModel);

    } else

    if (includeStrings(userRequest.toLowerCase(), farewells)) {
        // agradece la atencion
        textResponse = 'Fue un placer poder servirle. Hasta pronto 😁';
        textModel = getTextData(textResponse, number);
        dataModels.push(textModel);
    } else 

    if (includeStrings(userRequest.toLowerCase(), thanks)) {
        //se despide
        textResponse = 'De nada 😁';
        textModel = getTextData(textResponse, number);
        dataModels.push(textModel);
    } else 

    if (includeStrings(userRequest.toLowerCase(), menuList)) {
        //quiere el menu
        listModel = getListData(number);
        dataModels.push(listModel);
    } else {
        //no se entendio el mensaje
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
    getButtonsData,
    formatNumber,
}