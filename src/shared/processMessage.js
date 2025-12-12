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
  // Remove the "1" after the country code for 13-digit numbers
  // Example: 5219991992696 -> 529991992696
  // This handles Mexico and other countries with similar format
  if (numero.length === 13) {
    // Keep first 2 digits (country code) + last 10 digits (phone number)
    return `${numero.slice(0, 2)}${numero.slice(3)}`;
  }
  
  // Return as-is if not 13 digits
  return numero;
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

/**
 * Extract readable content from template components for display in chat
 * @param {Object} template - Template object with components array
 * @param {Array} parameters - Array of parameter values to replace placeholders
 * @returns {String} - Human-readable template content with parameters replaced
 */
const getTemplateDisplayContent = (template, parameters = []) => {
  if (!template || !template.components || template.components.length === 0) {
    return `📄 Template: ${template?.name || 'Unknown'}`;
  }

  let content = [];

  template.components.forEach(component => {
    if (component.text) {
      let text = component.text;
      
      // Replace placeholders {{1}}, {{2}}, etc. with actual parameter values
      if (parameters && parameters.length > 0) {
        parameters.forEach((param, index) => {
          const placeholder = `{{${index + 1}}}`;
          text = text.replace(new RegExp(placeholder.replace(/[{}]/g, '\\$&'), 'g'), param);
        });
      }
      
      // Add component type prefix for clarity
      const prefix = component.type === 'HEADER' ? '📌 ' : 
                     component.type === 'FOOTER' ? '📎 ' : '';
      content.push(prefix + text);
    }
  });

  // If no text content found, fall back to template name
  if (content.length === 0) {
    return `📄 Template: ${template.name}`;
  }

  return content.join('\n');
};

module.exports = {
  getTextData,
  analizeText,
  getTemplateData,
  formatNumber,
  getLast10Digits,
  getTemplateDisplayContent,
};
