const axios = require('axios');
const UserThread = require('../models/UserThread');

const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
const OPENAI_ASSISTANT_ID = process.env.OPENAI_ASSISTANT_ID;
const BASE_URL = 'https://api.openai.com/v1';

// Store threads per user (in-memory cache for performance)
// Database persistence for reliability across restarts
const userThreads = new Map();

// Load thread from cache or database
async function getOrCreateThread(userId, headers) {
  // Check in-memory cache first
  let threadId = userThreads.get(userId);
  
  if (threadId) {
    console.log(`Using cached thread ${threadId} for user ${userId}`);
    return threadId;
  }

  // Check database
  try {
    let userThread = await UserThread.findOne({ userId });
    
    if (userThread) {
      threadId = userThread.threadId;
      userThreads.set(userId, threadId);
      
      // Update interaction stats
      userThread.messageCount += 1;
      userThread.lastInteraction = Date.now();
      await userThread.save();
      
      console.log(`Loaded thread ${threadId} from DB for user ${userId}`);
      return threadId;
    }
  } catch (dbError) {
    console.error('Database error loading thread:', dbError.message);
    // Continue to create new thread if DB fails
  }

  // Create new thread
  const threadResponse = await axios.post(`${BASE_URL}/threads`, {}, { headers });
  threadId = threadResponse.data.id;
  userThreads.set(userId, threadId);
  
  // Save to database
  try {
    await UserThread.create({
      userId,
      threadId,
      messageCount: 1
    });
    console.log(`Created and saved new thread ${threadId} for user ${userId}`);
  } catch (dbError) {
    console.error('Database error saving thread:', dbError.message);
    // Continue even if DB save fails - thread is still in memory
  }
  
  return threadId;
}

async function getAIResponse(message, userId) {
  if (!OPENAI_API_KEY || !OPENAI_ASSISTANT_ID) {
    throw new Error('OpenAI API key or Assistant ID not set');
  }

  const headers = {
    'Authorization': `Bearer ${OPENAI_API_KEY}`,
    'Content-Type': 'application/json',
    'OpenAI-Beta': 'assistants=v2'
  };

  try {
    // Step 1: Get or create a thread for this user
    const threadId = await getOrCreateThread(userId, headers);

    // Step 2: Add message to thread
    await axios.post(`${BASE_URL}/threads/${threadId}/messages`, {
      role: 'user',
      content: message
    }, { headers });

    // Step 3: Run the assistant
    const runResponse = await axios.post(`${BASE_URL}/threads/${threadId}/runs`, {
      assistant_id: OPENAI_ASSISTANT_ID
    }, { headers });
    const runId = runResponse.data.id;

    // Step 4: Poll for completion
    let run = runResponse.data;
    while (run.status === 'queued' || run.status === 'in_progress') {
      await new Promise(resolve => setTimeout(resolve, 1000)); // Wait 1 second
      const runStatusResponse = await axios.get(`${BASE_URL}/threads/${threadId}/runs/${runId}`, { headers });
      run = runStatusResponse.data;
    }

    if (run.status !== 'completed') {
      console.error('Run failed with status:', run.status);
      return 'Lo siento, no pude procesar tu mensaje en este momento.';
    }

    // Step 5: Get messages
    const messagesResponse = await axios.get(`${BASE_URL}/threads/${threadId}/messages`, { headers });
    const assistantMessages = messagesResponse.data.data.filter(msg => msg.role === 'assistant');
    
    if (assistantMessages.length > 0) {
      const latestMessage = assistantMessages[0];
      const textContent = latestMessage.content.find(c => c.type === 'text');
      return textContent?.text?.value || 'No response from AI.';
    }

    return 'No response from AI.';
  } catch (error) {
    console.error('OpenAI error:', error.response?.data || error.message);
    return 'Lo siento, hubo un error con el asistente IA.';
  }
}

// Clear context for a specific user
async function clearUserContext(userId) {
  const threadId = userThreads.get(userId);
  userThreads.delete(userId);
  
  // Also delete from database
  try {
    await UserThread.deleteOne({ userId });
    console.log(`Cleared context for user ${userId}, thread ${threadId}`);
    return true;
  } catch (error) {
    console.error('Error clearing user context from DB:', error.message);
    return false;
  }
}

// Clear all user contexts (useful for maintenance/restart)
async function clearAllContexts() {
  const count = userThreads.size;
  userThreads.clear();
  
  // Also clear from database
  try {
    const result = await UserThread.deleteMany({});
    console.log(`Cleared ${count} in-memory and ${result.deletedCount} DB user contexts`);
    return result.deletedCount;
  } catch (error) {
    console.error('Error clearing all contexts from DB:', error.message);
    return count;
  }
}

// Get active users count
async function getActiveUsersCount() {
  try {
    const dbCount = await UserThread.countDocuments();
    return {
      inMemory: userThreads.size,
      database: dbCount
    };
  } catch (error) {
    return {
      inMemory: userThreads.size,
      database: 0
    };
  }
}

module.exports = { getAIResponse, clearUserContext, clearAllContexts, getActiveUsersCount };
