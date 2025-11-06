const axios = require("axios");
const UserThread = require("../models/UserThread");

const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
const OPENAI_ASSISTANT_ID = process.env.OPENAI_ASSISTANT_ID;
const BASE_URL = "https://api.openai.com/v1";

// Store threads per user (in-memory cache for performance)
// Database persistence for reliability across restarts
const userThreads = new Map();

// Configuration for message management
const MAX_MESSAGES_PER_THREAD = 10;
const CLEANUP_THRESHOLD = 15; // When to trigger cleanup

// ============================================
// CONCURRENT REQUEST PROTECTION
// ============================================
// Prevents multiple simultaneous AI requests for the same user
// This protects against race conditions and duplicate processing
const processingUsers = new Map(); // userId -> Promise
const PROCESSING_TIMEOUT = 120000; // 120 seconds max wait

async function waitForUserProcessing(userId) {
  const startTime = Date.now();
  
  // If user is being processed, wait for it to complete
  while (processingUsers.has(userId)) {
    // Check for timeout to prevent infinite waiting
    if (Date.now() - startTime > PROCESSING_TIMEOUT) {
      console.warn(`⚠️ Timeout waiting for user ${userId} processing - forcing through`);
      endUserProcessing(userId); // Force cleanup
      break;
    }
    
    console.log(`⏳ User ${userId} is being processed, waiting...`);
    await processingUsers.get(userId).catch(() => {}); // Catch if promise was rejected
    
    // Small delay to prevent tight loop
    if (processingUsers.has(userId)) {
      await new Promise(resolve => setTimeout(resolve, 500));
    }
  }
}

function startUserProcessing(userId) {
  let resolver;
  const promise = new Promise((resolve) => {
    resolver = resolve;
  });
  processingUsers.set(userId, promise);
  return resolver;
}

function endUserProcessing(userId) {
  const entry = processingUsers.get(userId);
  processingUsers.delete(userId);
  return entry;
}
// ============================================

// Clean up old messages in thread to keep only the last N messages
async function cleanupThreadMessages(threadId, headers, maxMessages = MAX_MESSAGES_PER_THREAD) {
  try {
    console.log(`🧹 Cleaning up thread ${threadId} to keep last ${maxMessages} messages`);
    
    // Get all messages in the thread
    const messagesResponse = await axios.get(
      `${BASE_URL}/threads/${threadId}/messages?order=desc&limit=100`,
      { headers }
    );
    
    const messages = messagesResponse.data.data;
    console.log(`Found ${messages.length} messages in thread`);
    
    if (messages.length <= maxMessages) {
      console.log(`Thread has ${messages.length} messages, no cleanup needed`);
      return;
    }
    
    // Keep the most recent maxMessages, delete the rest
    const messagesToDelete = messages.slice(maxMessages);
    console.log(`Deleting ${messagesToDelete.length} old messages`);
    
    for (const message of messagesToDelete) {
      try {
        await axios.delete(
          `${BASE_URL}/threads/${threadId}/messages/${message.id}`,
          { headers }
        );
      } catch (deleteError) {
        console.error(`Error deleting message ${message.id}:`, deleteError.response?.data || deleteError.message);
      }
    }
    
    console.log(`✅ Thread cleanup completed. Kept ${maxMessages} recent messages`);
  } catch (error) {
    console.error("Error during thread cleanup:", error.response?.data || error.message);
    // Don't throw - cleanup is optional
  }
}

// Load thread from cache or database
async function getOrCreateThread(userId, phoneNumber, headers) {
  // Check in-memory cache first
  let threadId = userThreads.get(userId);
  let shouldCleanup = false;

  if (threadId) {
    console.log(`Using cached thread ${threadId} for user ${userId}`);
  } else {
    // Check database
    try {
      let userThread = await UserThread.findOne({ userId });

      if (userThread) {
        threadId = userThread.threadId;
        userThreads.set(userId, threadId);
        console.log(`Loaded thread ${threadId} from DB for user ${userId}`);

        // Check if cleanup is needed based on message count
        if (userThread.messageCount >= CLEANUP_THRESHOLD) {
          shouldCleanup = true;
        }
      }
    } catch (dbError) {
      console.error("Database error loading thread:", dbError.message);
      // Continue to create new thread if DB fails
    }
  }

  // Create new thread if none exists
  if (!threadId) {
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
  } else {
    // Update existing thread stats
    try {
      await UserThread.updateOne(
        { userId },
        { 
          $inc: { messageCount: 1 },
          $set: { lastInteraction: Date.now() }
        }
      );
    } catch (dbError) {
      console.error("Database error updating thread:", dbError.message);
    }

    // Perform cleanup if needed
    if (shouldCleanup) {
      await cleanupThreadMessages(threadId, headers);
      
      // Reset message count after cleanup
      try {
        await UserThread.updateOne(
          { userId },
          { 
            $set: { 
              messageCount: MAX_MESSAGES_PER_THREAD,
              lastCleanup: Date.now()
            } 
          }
        );
      } catch (dbError) {
        console.error("Database error resetting message count:", dbError.message);
      }
    }
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

    // Check for runs that are active OR cancelling
    const problematicRuns = runsResponse.data.data.filter(
      (run) => run.status === "queued" || 
               run.status === "in_progress" || 
               run.status === "cancelling"
    );

    if (problematicRuns.length > 0) {
      console.log(
        `Found ${problematicRuns.length} active/cancelling run(s) for thread ${threadId}`
      );

      // Cancel all active runs (skip already cancelling ones)
      const runsToCancel = problematicRuns.filter(
        (run) => run.status !== "cancelling"
      );

      for (const run of runsToCancel) {
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

      // Wait for ALL runs (including cancelling ones) to reach a terminal state
      let attempts = 0;
      const maxAttempts = 15; // 15 seconds max (increased from 10)
      let stillProblematic = true;

      while (stillProblematic && attempts < maxAttempts) {
        await new Promise((resolve) => setTimeout(resolve, 1000));
        
        const checkResponse = await axios.get(
          `${BASE_URL}/threads/${threadId}/runs`,
          { headers }
        );

        // Check for ANY non-terminal state
        const activeRunsCheck = checkResponse.data.data.filter(
          (run) => run.status === "queued" || 
                   run.status === "in_progress" || 
                   run.status === "cancelling"
        );

        stillProblematic = activeRunsCheck.length > 0;
        attempts++;

        if (stillProblematic) {
          const states = activeRunsCheck.map(r => `${r.id.slice(-8)}:${r.status}`).join(', ');
          console.log(`Waiting for runs to complete: ${states} (${attempts}/${maxAttempts})`);
        }
      }

      if (stillProblematic) {
        console.warn("⚠️ Some runs still not in terminal state after waiting");
        // Wait a bit longer as a fallback
        await new Promise((resolve) => setTimeout(resolve, 3000));
      } else {
        console.log("✅ All runs reached terminal state");
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
        console.log("🎫 Creating ticket with args:", functionArgs);
        
        // Build comprehensive ticket data with multimedia support
        const ticketData = {
          ...functionArgs,
          phone_number: userId,
          image_urls: functionArgs.image_urls || [],
          location: functionArgs.location || null,
          attachments_count: (functionArgs.image_urls || []).length,
          created_at: new Date().toISOString(),
        };
        
        // Log multimedia attachments
        if (ticketData.image_urls.length > 0) {
          console.log(`   📸 Ticket includes ${ticketData.image_urls.length} image(s)`);
          ticketData.image_urls.forEach((url, idx) => {
            console.log(`      Image ${idx + 1}: ${url}`);
          });
        }
        
        if (ticketData.location) {
          console.log(`   📍 Ticket includes location: ${ticketData.location.formatted_address}`);
        }
        
        // TODO: Replace with actual API call to your ticket system
        // Example: const apiResponse = await axios.post('YOUR_TICKET_API_URL', ticketData);
        
        // Simulated ticket creation result
        const ticketResult = {
          success: true,
          ticketId: `TICKET-${Date.now()}`,
          status: "created",
          phone: userId,
          priority: ticketData.priority || "medium",
          subject: ticketData.subject || "Nuevo ticket",
          description: ticketData.description || "",
          image_urls: ticketData.image_urls,
          location: ticketData.location,
          attachments_count: ticketData.attachments_count,
          created_at: ticketData.created_at,
          estimated_response_time: "24 horas",
          message: "Ticket creado exitosamente con todos los detalles multimedia"
        };

        output = JSON.stringify(ticketResult);
        console.log("✅ Ticket created successfully:", ticketResult.ticketId);
      } else if (functionName === "get_ticket_information") {
        // Retrieve ticket information by ticket_id or phone_number
        console.log("Obteniendo información del ticket con args:", functionArgs);
        const { ticket_id, phone_number } = functionArgs;
        
        // Simula llamada a API interna - fake data for now
        const ticketInfo = {
          success: true,
          ticket_id: ticket_id || "TICKET12345",
          phone_number: phone_number || userId,
          status: "open",
          priority: "high",
          subject: "Problema con conexión a internet",
          description: "El cliente reporta intermitencias en el servicio de internet desde hace 2 días",
          created_at: "2025-10-25T10:30:00Z",
          last_updated: "2025-10-27T14:20:00Z",
          assigned_to: "Soporte Técnico - Nivel 2",
          estimated_resolution: "2025-10-28T18:00:00Z",
          customer_name: "Juan Pérez",
          customer_email: "juan.perez@example.com",
          notes: [
            {
              date: "2025-10-25T10:30:00Z",
              author: "Sistema",
              note: "Ticket creado automáticamente"
            },
            {
              date: "2025-10-26T09:15:00Z",
              author: "Técnico Carlos",
              note: "Se realizó diagnóstico remoto. Se detectó problema en router"
            }
          ]
        };

        output = JSON.stringify(ticketInfo);
        console.log("Información del ticket obtenida:", ticketInfo);
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

async function getAIResponse(message, userId, context = {}) {
  if (!OPENAI_API_KEY || !OPENAI_ASSISTANT_ID) {
    throw new Error("OpenAI API key or Assistant ID not set");
  }

  const headers = {
    Authorization: `Bearer ${OPENAI_API_KEY}`,
    "Content-Type": "application/json",
    "OpenAI-Beta": "assistants=v2",
  };

  // ============================================
  // CONCURRENT REQUEST PROTECTION
  // ============================================
  // Wait if this user is already being processed
  await waitForUserProcessing(userId);
  
  // Mark this user as being processed
  const processingResolver = startUserProcessing(userId);
  
  try {
    console.log(`🚀 Starting AI processing for user ${userId}`);
    
    // Step 1: Get or create a thread for this user (userId is the phone number)
    const threadId = await getOrCreateThread(userId, userId, headers);

    // Step 2: Check for active runs and cancel them
    await ensureNoActiveRun(threadId, headers);

    // Step 3: Build metadata with multimedia context
    const metadata = {
      phone_number: userId,
    };

    // Add image context if present
    if (context.imageUrl) {
      metadata.has_image = "true";
      metadata.image_url = context.imageUrl;
      if (context.imageCaption) {
        metadata.image_caption = context.imageCaption;
      }
    }

    // Add location context if present
    if (context.location) {
      metadata.has_location = "true";
      metadata.location_address = context.location.formatted_address || "";
      metadata.location_coords = context.location.coordinates_string || "";
      if (context.location.city) {
        metadata.location_city = context.location.city;
      }
      if (context.location.state) {
        metadata.location_state = context.location.state;
      }
    }

    // Add message to thread with enriched metadata - with retry logic
    let messageAdded = false;
    let retryCount = 0;
    const maxRetries = 3;

    while (!messageAdded && retryCount < maxRetries) {
      try {
        await axios.post(
          `${BASE_URL}/threads/${threadId}/messages`,
          {
            role: "user",
            content: message,
            metadata: metadata
          },
          { headers }
        );
        messageAdded = true;
        console.log("✅ Message added to thread successfully");
      } catch (msgError) {
        if (msgError.response?.data?.error?.message?.includes("while a run") && retryCount < maxRetries - 1) {
          retryCount++;
          console.log(`⚠️ Run still active, retry ${retryCount}/${maxRetries} in 2s...`);
          await new Promise((resolve) => setTimeout(resolve, 2000));
          // Re-check for active runs
          await ensureNoActiveRun(threadId, headers);
        } else {
          throw msgError; // Re-throw if not a run conflict or out of retries
        }
      }
    }

    if (!messageAdded) {
      throw new Error("Failed to add message after maximum retries");
    }

    // Step 4: Run the assistant
    const runResponse = await axios.post(
      `${BASE_URL}/threads/${threadId}/runs`,
      {
        assistant_id: OPENAI_ASSISTANT_ID,
        additional_instructions: `The user's WhatsApp phone number is: ${userId}. You can reference this phone number if needed for appointments, tickets, or identification but you have to confirm by asking the user.`
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
  } finally {
    // ============================================
    // RELEASE PROCESSING LOCK
    // ============================================
    // Always release the processing lock, even if error occurred
    endUserProcessing(userId);
    if (processingResolver) processingResolver();
    console.log(`✅ Finished AI processing for user ${userId}`);
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

// Clean up messages for a specific user's thread
async function cleanupUserThread(userId) {
  const headers = {
    Authorization: `Bearer ${OPENAI_API_KEY}`,
    "Content-Type": "application/json",
    "OpenAI-Beta": "assistants=v2",
  };

  try {
    const userThread = await UserThread.findOne({ userId });
    if (!userThread) {
      console.log(`No thread found for user ${userId}`);
      return false;
    }

    await cleanupThreadMessages(userThread.threadId, headers);
    
    // Reset message count and update cleanup timestamp
    userThread.messageCount = MAX_MESSAGES_PER_THREAD;
    userThread.lastCleanup = Date.now();
    await userThread.save();
    
    console.log(`✅ Cleaned up thread for user ${userId}`);
    return true;
  } catch (error) {
    console.error(`Error cleaning up thread for user ${userId}:`, error.message);
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
  cleanupUserThread,
};
