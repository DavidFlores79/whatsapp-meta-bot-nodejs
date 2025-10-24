const axios = require('axios');

const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
const OPENAI_ASSISTANT_ID = process.env.OPENAI_ASSISTANT_ID;

async function getAIResponse(message, userId) {
  if (!OPENAI_API_KEY || !OPENAI_ASSISTANT_ID) {
    throw new Error('OpenAI API key or Assistant ID not set');
  }
  const url = `https://api.openai.com/v1/assistants/${OPENAI_ASSISTANT_ID}/messages`;
  try {
    const response = await axios.post(url, {
      user: userId,
      input: message
    }, {
      headers: {
        'Authorization': `Bearer ${OPENAI_API_KEY}`,
        'Content-Type': 'application/json'
      }
    });
    // Expecting response.data.reply or similar
    return response.data.reply || response.data.choices?.[0]?.text || 'No response from AI.';
  } catch (error) {
    console.error('OpenAI error:', error.response?.data || error.message);
    return 'Lo siento, hubo un error con el asistente IA.';
  }
}

module.exports = { getAIResponse };
