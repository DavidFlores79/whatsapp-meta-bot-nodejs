const axios = require("axios");
const UserThread = require("../models/UserThread");

const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
const OPENAI_ASSISTANT_ID = process.env.OPENAI_ASSISTANT_ID;
const BASE_URL = "https://api.openai.com/v1";

// Store threads per user (in-memory cache for performance)
// Database persistence for reliability across restarts
const userThreads = new Map();

// Load thread from cache or database
async function getOrCreateThread(userId, phoneNumber, headers) {
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
    console.error("Database error loading thread:", dbError.message);
    // Continue to create new thread if DB fails
  }

  // Create new thread with metadata including phone number
  const threadResponse = await axios.post(
    `${BASE_URL}/threads`,
    {
      metadata: {
        user_id: userId,
        phone_number: phoneNumber,
      }
    },
    { headers }
  );
  threadId = threadResponse.data.id;
  userThreads.set(userId, threadId);

  // Save to database
  try {
    await UserThread.create({
      userId,
      threadId,
      messageCount: 1,
    });
    console.log(`Created and saved new thread ${threadId} for user ${userId}`);
  } catch (dbError) {
    console.error("Database error saving thread:", dbError.message);
    // Continue even if DB save fails - thread is still in memory
  }

  return threadId;
}

// Check for active runs and cancel them if necessary
async function ensureNoActiveRun(threadId, headers) {
  try {
    // Get list of runs for this thread
    const runsResponse = await axios.get(
      `${BASE_URL}/threads/${threadId}/runs`,
      { headers }
    );

    const activeRuns = runsResponse.data.data.filter(
      (run) => run.status === "queued" || run.status === "in_progress"
    );

    if (activeRuns.length > 0) {
      console.log(
        `Found ${activeRuns.length} active run(s) for thread ${threadId}, cancelling them...`
      );

      // Cancel all active runs
      for (const run of activeRuns) {
        try {
          await axios.post(
            `${BASE_URL}/threads/${threadId}/runs/${run.id}/cancel`,
            {},
            { headers }
          );
          console.log(`Cancelled run ${run.id}`);
        } catch (cancelError) {
          console.error(
            `Error cancelling run ${run.id}:`,
            cancelError.response?.data || cancelError.message
          );
        }
      }

      // Wait for cancellations to complete (poll until no active runs)
      let attempts = 0;
      const maxAttempts = 10; // 10 seconds max
      let stillActive = true;

      while (stillActive && attempts < maxAttempts) {
        await new Promise((resolve) => setTimeout(resolve, 1000));
        
        const checkResponse = await axios.get(
          `${BASE_URL}/threads/${threadId}/runs`,
          { headers }
        );

        const activeRunsCheck = checkResponse.data.data.filter(
          (run) => run.status === "queued" || run.status === "in_progress"
        );

        stillActive = activeRunsCheck.length > 0;
        attempts++;

        if (stillActive) {
          console.log(`Still waiting for runs to cancel (${attempts}/${maxAttempts})...`);
        }
      }

      if (stillActive) {
        console.warn("Some runs are still active after cancellation attempts");
        // Wait a bit longer as a fallback
        await new Promise((resolve) => setTimeout(resolve, 2000));
      } else {
        console.log("All runs successfully cancelled");
      }
    }
  } catch (error) {
    console.error(
      "Error checking for active runs:",
      error.response?.data || error.message
    );
    // Don't throw - continue with the flow
  }
}

// Handle tool calls required by the assistant
async function handleToolCalls(threadId, runId, toolCalls, headers, userId) {
  const toolOutputs = [];

  for (const call of toolCalls) {
    const functionName = call.function.name;
    const functionArgs = JSON.parse(call.function.arguments || "{}");

    console.log("🔧 Assistant quiere llamar a:", functionName, "con args:", functionArgs);

    let output;

    try {
      if (functionName === "create_ticket_report") {
        // aquí haces tu lógica de crear ticket con tu API interna
        console.log("Creando ticket con args:", functionArgs);
        // Add phone number to the ticket data
        const ticketData = {
          ...functionArgs,
          phone_number: userId,
        };
        
        // Simula llamada a API interna y obtén resultado
        const ticketResult = {
          ticketId: "TICKET12345",
          status: "created",
          phone: userId,
        };

        output = JSON.stringify(ticketResult);
        console.log("Ticket creado:", ticketResult);
      } else if (functionName === "otra_function") {
        // lógica distinta
        output = JSON.stringify({ success: true });
      } else {
        console.warn(`Unknown function: ${functionName}`);
        output = JSON.stringify({ error: `Unknown function: ${functionName}` });
      }
    } catch (toolError) {
      console.error(`Error executing tool ${functionName}:`, toolError);
      output = JSON.stringify({ 
        error: "Tool execution failed", 
        message: toolError.message 
      });
    }

    toolOutputs.push({
      tool_call_id: call.id,
      output: output,
    });
  }

  // Submit all tool outputs back to the run
  await axios.post(
    `${BASE_URL}/threads/${threadId}/runs/${runId}/submit_tool_outputs`,
    {
      tool_outputs: toolOutputs,
    },
    { headers }
  );

  console.log("✅ Tool outputs enviados al asistente.");
}

// Poll run until completion
async function pollRunCompletion(threadId, runId, headers) {
  let run;
  let attempts = 0;
  const maxAttempts = 60; // 60 seconds max

  do {
    await new Promise((resolve) => setTimeout(resolve, 1000));
    const runStatusResponse = await axios.get(
      `${BASE_URL}/threads/${threadId}/runs/${runId}`,
      { headers }
    );
    run = runStatusResponse.data;
    attempts++;

    console.log(`Run status: ${run.status} (attempt ${attempts}/${maxAttempts})`);

    if (attempts >= maxAttempts) {
      throw new Error("Run timeout: exceeded maximum polling time");
    }
  } while (run.status === "queued" || run.status === "in_progress");

  return run;
}

async function getAIResponse(message, userId) {
  if (!OPENAI_API_KEY || !OPENAI_ASSISTANT_ID) {
    throw new Error("OpenAI API key or Assistant ID not set");
  }

  const headers = {
    Authorization: `Bearer ${OPENAI_API_KEY}`,
    "Content-Type": "application/json",
    "OpenAI-Beta": "assistants=v2",
  };

  try {
    // Step 1: Get or create a thread for this user (userId is the phone number)
    const threadId = await getOrCreateThread(userId, userId, headers);

    // Step 2: Check for active runs and cancel them
    await ensureNoActiveRun(threadId, headers);

    // Step 3: Add message to thread with phone number in metadata
    await axios.post(
      `${BASE_URL}/threads/${threadId}/messages`,
      {
        role: "user",
        content: message,
        metadata: {
          phone_number: userId,
        }
      },
      { headers }
    );

    // Step 4: Run the assistant
    const runResponse = await axios.post(
      `${BASE_URL}/threads/${threadId}/runs`,
      {
        assistant_id: OPENAI_ASSISTANT_ID,
        additional_instructions: `The user's WhatsApp phone number is: ${userId}. You can reference this phone number if needed for appointments, tickets, or identification without asking the user.`
      },
      { headers }
    );
    const runId = runResponse.data.id;

    // Step 5: Poll for completion
    let run = await pollRunCompletion(threadId, runId, headers);

    // Handle tool calls if required (limit to prevent infinite loops)
    let toolCallAttempts = 0;
    const maxToolCallAttempts = 3;

    while (
      run.status === "requires_action" &&
      run.required_action?.submit_tool_outputs &&
      toolCallAttempts < maxToolCallAttempts
    ) {
      console.log(`Handling tool calls (attempt ${toolCallAttempts + 1}/${maxToolCallAttempts})`);
      const toolCalls = run.required_action.submit_tool_outputs.tool_calls;
      await handleToolCalls(threadId, runId, toolCalls, headers, userId);
      
      // Poll again after submitting tool outputs
      run = await pollRunCompletion(threadId, runId, headers);
      toolCallAttempts++;
    }

    if (toolCallAttempts >= maxToolCallAttempts && run.status === "requires_action") {
      console.error("Max tool call attempts reached");
      return "Lo siento, el asistente requiere demasiadas acciones. Por favor intenta de nuevo.";
    }

    if (run.status !== "completed") {
      console.error("Run failed with status:", run.status);
      return "Lo siento, no pude procesar tu mensaje en este momento.";
    }

    // Step 6: Get messages
    const messagesResponse = await axios.get(
      `${BASE_URL}/threads/${threadId}/messages`,
      { headers }
    );
    const assistantMessages = messagesResponse.data.data.filter(
      (msg) => msg.role === "assistant"
    );

    if (assistantMessages.length > 0) {
      const latestMessage = assistantMessages[0];
      const textContent = latestMessage.content.find((c) => c.type === "text");
      return textContent?.text?.value || "No response from AI.";
    }

    return "No response from AI.";
  } catch (error) {
    console.error("OpenAI error:", error.response?.data || error.message);
    return "Lo siento, hubo un error con el asistente IA.";
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
    console.error("Error clearing user context from DB:", error.message);
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
    console.log(
      `Cleared ${count} in-memory and ${result.deletedCount} DB user contexts`
    );
    return result.deletedCount;
  } catch (error) {
    console.error("Error clearing all contexts from DB:", error.message);
    return count;
  }
}

// Get active users count
async function getActiveUsersCount() {
  try {
    const dbCount = await UserThread.countDocuments();
    return {
      inMemory: userThreads.size,
      database: dbCount,
    };
  } catch (error) {
    return {
      inMemory: userThreads.size,
      database: 0,
    };
  }
}

module.exports = {
  getAIResponse,
  clearUserContext,
  clearAllContexts,
  getActiveUsersCount,
};
