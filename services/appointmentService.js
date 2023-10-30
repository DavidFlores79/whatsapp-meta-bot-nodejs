const axios = require('axios');
const { getLast10Digits } = require('../shared/processMessage');

const URI = `http://${process.env.HOPER_API_URI}/appointments/info`;
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
  
      console.log({URI});
      // Make the POST request to the API with the custom headers
      const response = await axios.post(URI, data, { headers });
      console.log({response});
  
      return response.data; // Return the API response

    } catch (error) {
        return error.response;
      }
  }

module.exports = {
    getAppointmentInfo,
}