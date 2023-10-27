const axios = require('axios');

const URI = process.env.HOPER_API;
const TOKEN = process.env.HOPER_TOKEN;

async function getAppointmentInfo( data ) {
    try {
  
      // Define the request headers with the Authorization header
      const headers = {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${TOKEN}`
      };
  
      // Make the POST request to the API with the custom headers
      const response = await axios.post(URI, data, { headers });
  
      // Access the response data (response.data) and assign it to a variable
      const apiResponse = response.data;
  
      // Perform any other logic you need with the response
      // ...
      return apiResponse; // Return the API response

    } catch (error) {
      console.error('Error calling the API:', error);
      throw error; // You can handle the error as needed
    }
  }

module.exports = {
    getAppointmentInfo,
}