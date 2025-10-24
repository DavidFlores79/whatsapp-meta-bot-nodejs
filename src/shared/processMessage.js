const { buildTemplateJSON } = require("../shared/whatsappModels");
const whatsappService = require("../services/whatsappService");

const getTextData = (textResponse, number) => {
  // Verificar que el número tenga 11 dígitos
  if (number.length == 13) {
    number = formatNumber(number);
  }

  // textResponse = analizeText(userRequest, number);

  const dataObject = buildTextJSON(textResponse, number);

  console.log({ dataObject });

  return dataObject;
};

const getTemplateData = (number, templateName, parameters, language) => {
  // Verificar que el número tenga 11 dígitos
  if (number.length == 13) {
    number = formatNumber(number);
  }

  const dataObject = buildTemplateJSON(
    number,
    templateName,
    parameters,
    language
  );

  return dataObject;
};

const formatNumber = (numero) => {
  // Formatear el número con "52" en lugar de "521"
  const numeroFormateado = `52${numero.slice(3)}`;

  return numeroFormateado;
};

const analizeText = (userRequest, number) => {
  let textResponse = `No entendí el mensaje: *${userRequest}*. Puedes escribir MENU para acceder a las opciones.`;
  let dataModels = [];

  //no se entendio el mensaje
  textModel = getTextData(textResponse, number);
  dataModels.push(textModel);

  dataModels.forEach((data) => {
    whatsappService.sendWhatsappResponse(data);
  });

};

const getLast10Digits = (phoneNumber) => {
  return phoneNumber.slice(-10);
};

module.exports = {
  getTextData,
  analizeText,
  getTemplateData,
  formatNumber,
  getLast10Digits,
};
