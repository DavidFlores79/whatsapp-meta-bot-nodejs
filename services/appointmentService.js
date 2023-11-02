const axios = require('axios');
const { getLast10Digits, getTextData } = require('../shared/processMessage');
const whatsappService = require('../services/whatsappService');

const URI = `https://${process.env.HOPER_API_URI}/api/v1`;
const TOKEN = process.env.HOPER_API_TOKEN;

async function getAppointmentInfo(phone) {

  const data = {
    phone: getLast10Digits(phone)
  }

  try {

    // Define the request headers with the Authorization header
    const headers = {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${TOKEN}`
    };

    // Make the POST request to the API with the custom headers
    const response = await axios.post(`${URI}/appointments/info`, data, { headers });

    if (!response.data) return null;

    console.log('********** Response Data ***********', response.data);
    return response.data; // Return the API response

  } catch (error) {
    console.log('************ ERROR ******************');
    console.log(error.response.data);
    console.log('************ ERROR ******************');
    let dataMsg = getTextData(`${error.response.data.message}`, phone);
    whatsappService.sendWhatsappResponse(dataMsg);
    return null;
  }
}

async function confirmAppointment( apppointmentId ) {

  const data = {
    id: apppointmentId
  }

  try {

    // Define the request headers with the Authorization header
    const headers = {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${TOKEN}`
    };

    // Make the POST request to the API with the custom headers
    const response = await axios.post(`${URI}/confirm-appointment`, data, { headers });

    if (!response.data) return null;

    console.log('********** Response Data ***********', response.data);
    return response.data; // Return the API response


  } catch (error) {
    console.log('************ ERROR ******************');
    console.log(error.response.data);
    console.log('************ ERROR ******************');
    let dataMsg = getTextData(`${error.response.data.message}`, phone);
    whatsappService.sendWhatsappResponse(dataMsg);
    return null;
  }
}

async function confirmAppointmentByPhone( phoneNumber ) {

  const data = { phone: getLast10Digits(phoneNumber) };

  try {

    // Define the request headers with the Authorization header
    const headers = {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${TOKEN}`
    };

    // Make the POST request to the API with the custom headers
    const response = await axios.post(`${URI}/confirm-appointment-phone`, data, { headers });

    if (!response.data) return null;

    console.log('********** Response Data ***********', response.data);
    return response.data; // Return the API response


  } catch (error) {
    console.log('************ ERROR ******************');
    console.log(error.response);
    console.log('************ ERROR ******************');
    const errorMsg = (error.response) ? error.response.data : 'Error desconcido.';
    let dataMsg = getTextData(`Error: ${errorMsg}`, phoneNumber);
    whatsappService.sendWhatsappResponse(dataMsg);
    return null;
  }
}

module.exports = {
  getAppointmentInfo,
  confirmAppointment,
  confirmAppointmentByPhone,

}