const { buildTextJSON } = require("../shared/whatsappModels");

const getTextData = (userRequest, number) => {

    // Verificar que el número tenga 11 dígitos
    if (number.length == 13) {
        number = formatNumber(number);
    };

    textResponse = analizeText(userRequest);

    const dataObject = buildTextJSON(textResponse, number);

    console.log({ dataObject });

    return dataObject;
}

const formatNumber = (numero) => {

    // Formatear el número con "52" en lugar de "521"
    const numeroFormateado = `52${numero.slice(3)}`;

    return numeroFormateado;
}

const analizeText = (userRequest) => {
    const greetings = ['hola', 'hi', 'hello', 'buenas', 'buenas tardes', 'buenas noches', 'buenos días', 'buenos dias'];
    const farewells = ['adios', 'bye', 'hasta pronto', 'adiós', 'nos vemos'];
    const thanks = ['gracias', 'thank you', 'thanks', 'grax'];

    if (includeStrings(userRequest, greetings)) {
        userRequest = 'Gracias por comunicarse a *Clínica Hoper* ¿Cómo podemos ayudarle? le recordamos que por este medio la atención sólo por mensaje, no llamadas.';
    }

    if (includeStrings(userRequest, farewells)) {
        userRequest = 'Fue un placer poder servirle. Hasta pronto 😁';
    }

    if (includeStrings(userRequest, thanks)) {
        userRequest = 'De nada 😁';
    }

    return userRequest;

}

const includeStrings = (texto, arrayDeCadenas) => {
    // Utiliza Array.some() para verificar si alguna cadena del array está incluida en el texto
    return arrayDeCadenas.some(cadena => texto.includes(cadena));
}

module.exports = {
    getTextData,
}