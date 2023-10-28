const axios = require('axios');
const { getLast10Digits } = require('../shared/processMessage');

const URI = process.env.HOPER_API_URI;
const TOKEN = process.env.HOPER_API_TOKEN;

async function getAppointmentInfo( phone ) {

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
      const response = await axios.post(`http://${URI}/appointments/info`, data, { headers });
  
      return response.data; // Return the API response

    } catch (error) {
        return error.response;
      }
  }

module.exports = {
    getAppointmentInfo,
}