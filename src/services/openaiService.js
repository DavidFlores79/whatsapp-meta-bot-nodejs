const axios = require("axios");
const UserThread = require("../models/UserThread");
const Message = require("../models/Message");
const { io } = require("../models/server");

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
const processingUsers = new Map(); // userId -> Promise
const PROCESSING_TIMEOUT = 120000; // 120 seconds max wait

async function waitForUserProcessing(userId) {
  const startTime = Date.now();
  while (processingUsers.has(userId)) {
    if (Date.now() - startTime > PROCESSING_TIMEOUT) {
      console.warn(`⚠️ Timeout waiting for user ${userId} processing - forcing through`);
      endUserProcessing(userId);
      break;
    }
    console.log(`⏳ User ${userId} is being processed, waiting...`);
    await processingUsers.get(userId).catch(() => { });
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
// HELPER FUNCTIONS
// ============================================

// Clean up old messages in thread
async function cleanupThreadMessages(threadId, headers, maxMessages = MAX_MESSAGES_PER_THREAD) {
  try {
    const messagesResponse = await axios.get(
      `${BASE_URL}/threads/${threadId}/messages?order=desc&limit=100`,
      { headers }
    );
    const messages = messagesResponse.data.data;
    if (messages.length <= maxMessages) return;

    const messagesToDelete = messages.slice(maxMessages);
    for (const message of messagesToDelete) {
      try {
        await axios.delete(
          `${BASE_URL}/threads/${threadId}/messages/${message.id}`,
          { headers }
        );
      } catch (e) { console.error(`Error deleting message ${message.id}:`, e.message); }
    }
  } catch (error) {
    console.error("Error during thread cleanup:", error.message);
  }
}

// Load thread from cache or database
async function getOrCreateThreadFromDB(userId, headers) {
  let threadId = userThreads.get(userId);
  let shouldCleanup = false;

  if (!threadId) {
    try {
      let userThread = await UserThread.findOne({ userId });
      if (userThread) {
        threadId = userThread.threadId;
        userThreads.set(userId, threadId);
        if (userThread.messageCount >= CLEANUP_THRESHOLD) shouldCleanup = true;
      }
    } catch (dbError) { console.error("Database error loading thread:", dbError.message); }
  }

  if (!threadId) {
    const threadResponse = await axios.post(
      `${BASE_URL}/threads`,
      { metadata: { user_id: userId, phone_number: userId } },
      { headers }
    );
    threadId = threadResponse.data.id;
    userThreads.set(userId, threadId);

    try {
      await UserThread.create({ userId, threadId, messageCount: 1 });
    } catch (dbError) { console.error("Database error saving thread:", dbError.message); }
  } else {
    try {
      await UserThread.updateOne({ userId }, { $inc: { messageCount: 1 }, $set: { lastInteraction: Date.now() } });
    } catch (e) { }
    if (shouldCleanup) {
      await cleanupThreadMessages(threadId, headers);
      try {
        await UserThread.updateOne({ userId }, { $set: { messageCount: MAX_MESSAGES_PER_THREAD, lastCleanup: Date.now() } });
      } catch (e) { }
    }
  }
  return threadId;
}

async function getOrCreateThread(userId, headers) {
  return await getOrCreateThreadFromDB(userId, headers);
}

async function ensureNoActiveRun(threadId, headers) {
  try {
    const runsResponse = await axios.get(`${BASE_URL}/threads/${threadId}/runs`, { headers });
    const problematicRuns = runsResponse.data.data.filter(r => ['queued', 'in_progress', 'cancelling'].includes(r.status));

    if (problematicRuns.length > 0) {
      const runsToCancel = problematicRuns.filter(r => r.status !== 'cancelling');
      for (const run of runsToCancel) {
        try {
          await axios.post(`${BASE_URL}/threads/${threadId}/runs/${run.id}/cancel`, {}, { headers });
        } catch (e) { }
      }

      let attempts = 0;
      while (attempts < 15) {
        await new Promise(r => setTimeout(r, 1000));
        const check = await axios.get(`${BASE_URL}/threads/${threadId}/runs`, { headers });
        if (!check.data.data.some(r => ['queued', 'in_progress', 'cancelling'].includes(r.status))) break;
        attempts++;
      }
    }
  } catch (e) { console.error("Error checking active runs:", e.message); }
}

async function addMessageToThread(threadId, message, context, headers) {
  const metadata = { phone_number: context.userId };
  if (context.imageUrl) {
    metadata.has_image = "true";
    metadata.image_url = context.imageUrl;
    if (context.imageCaption) metadata.image_caption = context.imageCaption;
  }
  if (context.location) {
    metadata.has_location = "true";
    metadata.location_address = context.location.formatted_address || "";
    metadata.location_coords = context.location.coordinates_string || "";
  }

  let messageAdded = false;
  let retryCount = 0;
  while (!messageAdded && retryCount < 3) {
    try {
      await axios.post(
        `${BASE_URL}/threads/${threadId}/messages`,
        { role: "user", content: message, metadata },
        { headers }
      );
      messageAdded = true;
    } catch (e) {
      if (e.response?.data?.error?.message?.includes("while a run") && retryCount < 2) {
        retryCount++;
        await new Promise(r => setTimeout(r, 2000));
        await ensureNoActiveRun(threadId, headers);
      } else {
        throw e;
      }
    }
  }
  if (!messageAdded) throw new Error("Failed to add message after retries");
}

async function runAssistant(threadId, userId, headers) {
  const runResponse = await axios.post(
    `${BASE_URL}/threads/${threadId}/runs`,
    {
      assistant_id: OPENAI_ASSISTANT_ID,
      additional_instructions: `The user's WhatsApp phone number is: ${userId}.`
    },
    { headers }
  );
  return runResponse.data.id;
}

async function pollRunCompletion(threadId, runId, headers) {
  let run;
  let attempts = 0;
  do {
    await new Promise(r => setTimeout(r, 1000));
    const res = await axios.get(`${BASE_URL}/threads/${threadId}/runs/${runId}`, { headers });
    run = res.data;
    attempts++;
    if (attempts >= 60) throw new Error("Run timeout");
  } while (['queued', 'in_progress'].includes(run.status));
  return run;
}

async function handleToolCalls(threadId, runId, toolCalls, headers, userId) {
  const ticketService = require('./ticketService');
  const configService = require('./configurationService');
  const Customer = require('../models/Customer');
  const UserThread = require('../models/UserThread');

  const toolOutputs = [];

  for (const call of toolCalls) {
    const functionName = call.function.name;
    const args = JSON.parse(call.function.arguments || "{}");
    let output;

    try {
      if (functionName === "create_ticket_report") {
        // Get terminology for response messages
        const terminology = await configService.getTicketTerminology();

        // Debug: Log the arguments received from OpenAI
        console.log("📝 create_ticket_report - Raw arguments received:", JSON.stringify(args, null, 2));

        // Validate required fields - handle potential field name variations
        const subject = args.subject || args.titulo || args.asunto || args.title;
        const description = args.description || args.descripcion || args.detalle || args.details;

        if (!subject || !description) {
          console.error("❌ create_ticket_report - Missing required fields:", { 
            subject: !!subject, 
            description: !!description,
            receivedArgs: args 
          });
          output = JSON.stringify({
            success: false,
            error: `No se pudo crear el ${terminology.ticketSingular}. Falta información requerida (asunto o descripción). Por favor proporciona más detalles sobre tu solicitud.`
          });
        } else {
          // Find customer by phone number
          const customer = await Customer.findOne({ phoneNumber: userId });
          if (!customer) {
            output = JSON.stringify({
              success: false,
              error: `No se pudo crear el ${terminology.ticketSingular}. Cliente no encontrado.`
            });
          } else {
            // Find conversation ID from thread
            const userThread = await UserThread.findOne({ userId, threadId });
            const conversationId = userThread ? userThread.conversationId : null;

            // Validate and create ticket
            const categories = await configService.getTicketCategories();
            const validCategories = categories.map(c => c.id);

            // Fallback to 'other' if invalid category
            let category = args.category || args.categoria || 'other';
            if (!validCategories.includes(category)) {
              category = 'other';
            }

            const ticket = await ticketService.createTicketFromAI({
              subject,
              description,
              category,
              priority: args.priority || args.prioridad || 'medium',
              location: args.location || args.ubicacion,
              customerId: customer._id,
              conversationId
            });

            console.log("✅ create_ticket_report - Ticket created successfully:", ticket.ticketId);

            output = JSON.stringify({
              success: true,
              ticketId: ticket.ticketId,
              message: `${terminology.ticketSingular} creado exitosamente con ID: ${ticket.ticketId}`
            });
          }
        }
      } else if (functionName === "get_ticket_information") {
        const terminology = await configService.getTicketTerminology();

        // Determine which phone number to use for customer lookup
        // If phone_number is provided in args AND different from userId, use it
        // Otherwise use the conversation's userId (current customer)
        const phoneToSearch = args.phone_number || userId;

        console.log(`🔍 get_ticket_information - Searching with phone: ${phoneToSearch}`);
        console.log(`   Args:`, args);

        // Find customer by phone number
        const customer = await Customer.findOne({ phoneNumber: phoneToSearch });
        if (!customer) {
          output = JSON.stringify({
            success: false,
            error: `No se pudo obtener información del ${terminology.ticketSingular}. Cliente no encontrado con el número proporcionado.`
          });
        } else {
          if (args.ticket_id) {
            // Get specific ticket by ID
            // Normalize ticket ID to uppercase for consistent searching
            const normalizedTicketId = args.ticket_id.toUpperCase().trim();
            console.log(`   Normalized ticket ID: ${args.ticket_id} → ${normalizedTicketId}`);

            // First try to find ticket by ID alone, then verify access
            const ticket = await ticketService.getTicketById(normalizedTicketId);

            if (!ticket) {
              output = JSON.stringify({
                success: false,
                error: `${terminology.ticketSingular} con ID "${normalizedTicketId}" no encontrado.`
              });
            } else if (ticket.customerId.toString() !== customer._id.toString()) {
              // Ticket exists but belongs to different customer
              output = JSON.stringify({
                success: false,
                error: `No tienes acceso al ${terminology.ticketSingular} "${normalizedTicketId}". Este ${terminology.ticketSingular} pertenece a otro cliente.`
              });
            } else {
              // Ticket found and customer has access
              output = JSON.stringify({
                success: true,
                ticket: {
                  ticketId: ticket.ticketId,
                  subject: ticket.subject,
                  description: ticket.description,
                  status: ticket.status,
                  priority: ticket.priority,
                  category: ticket.category,
                  createdAt: ticket.createdAt,
                  assignedAgent: ticket.assignedAgent ? `${ticket.assignedAgent.firstName} ${ticket.assignedAgent.lastName}` : null
                }
              });
            }
          } else if (args.lookup_recent) {
            // Get recent tickets
            const result = await ticketService.getTicketsByCustomer(customer._id, { limit: 5 });
            output = JSON.stringify({
              success: true,
              tickets: result.tickets.map(t => ({
                ticketId: t.ticketId,
                subject: t.subject,
                status: t.status,
                priority: t.priority,
                createdAt: t.createdAt
              })),
              total: result.total
            });
          } else {
            output = JSON.stringify({
              success: false,
              error: 'Debes proporcionar un ID de ticket o solicitar tickets recientes.'
            });
          }
        }
      } else {
        // Unknown function
        output = JSON.stringify({
          success: false,
          error: 'Función no reconocida'
        });
      }
    } catch (error) {
      console.error(`Error executing tool ${functionName}:`, error);
      output = JSON.stringify({
        success: false,
        error: 'Error al procesar la solicitud. Por favor intenta de nuevo.'
      });
    }

    toolOutputs.push({ tool_call_id: call.id, output });
  }

  await axios.post(
    `${BASE_URL}/threads/${threadId}/runs/${runId}/submit_tool_outputs`,
    { tool_outputs: toolOutputs },
    { headers }
  );
}

async function handleRunStatus(threadId, runId, headers, userId) {
  let run = await pollRunCompletion(threadId, runId, headers);
  let toolAttempts = 0;
  while (run.status === "requires_action" && run.required_action?.submit_tool_outputs && toolAttempts < 3) {
    await handleToolCalls(threadId, runId, run.required_action.submit_tool_outputs.tool_calls, headers, userId);
    run = await pollRunCompletion(threadId, runId, headers);
    toolAttempts++;
  }
  if (run.status !== "completed") {
    // Log detailed error information
    const errorDetails = {
      status: run.status,
      lastError: run.last_error,
      failedAt: run.failed_at,
      incompleteDetails: run.incomplete_details
    };
    console.error("🚨 OpenAI Run Failed - Detailed Error:", JSON.stringify(errorDetails, null, 2));
    
    // Throw with more context
    const errorMessage = run.last_error 
      ? `${run.last_error.code}: ${run.last_error.message}` 
      : run.status;
    throw new Error(`Run failed: ${errorMessage}`);
  }
  return run;
}

async function getAssistantResponse(threadId, runId, userId, conversationId) {
  const headers = {
    Authorization: `Bearer ${OPENAI_API_KEY}`,
    "Content-Type": "application/json",
    "OpenAI-Beta": "assistants=v2",
  };

  const response = await axios.get(
    `${BASE_URL}/threads/${threadId}/messages?limit=1&order=desc`,
    { headers }
  );

  const assistantMessages = response.data.data.filter(msg => msg.role === "assistant" && msg.run_id === runId);
  if (assistantMessages.length > 0) {
    const textContent = assistantMessages[0].content.find(c => c.type === "text");
    const aiResponseText = textContent?.text?.value || "No response";

    // Extract and update metadata from conversation context
    await updateThreadMetadataFromConversation(threadId, userId, headers);

    // NOTE: Socket emission is handled in queueService.js after saving to DB
    // Removed duplicate io.emit here to prevent duplicate messages in frontend

    return aiResponseText;
  }
  return "No response from AI.";
}

/**
 * Extract information from conversation and update thread metadata
 */
async function updateThreadMetadataFromConversation(threadId, userId, headers) {
  try {
    // Get recent messages to extract information
    const messagesResponse = await axios.get(
      `${BASE_URL}/threads/${threadId}/messages?limit=20&order=desc`,
      { headers }
    );

    const messages = messagesResponse.data.data;
    const conversationText = messages
      .map(m => {
        const content = m.content.find(c => c.type === "text");
        return `${m.role}: ${content?.text?.value || ""}`;
      })
      .join("\n");

    // Use AI to extract structured information
    const extractionPrompt = `Analyze this conversation and extract ONLY the following information if explicitly mentioned by the customer. Return ONLY a JSON object with these exact keys (use null for missing values):

{
  "customer_name": "full name if mentioned",
  "email": "email if mentioned",
  "address": "full address if mentioned",
  "city": "city if mentioned",
  "issue_type": "brief category like 'billing', 'support', 'sales'",
  "product_interest": "product or service mentioned"
}

Conversation:
${conversationText}

Return ONLY valid JSON, nothing else.`;

    const extraction = await getChatCompletion(
      [{ role: "user", content: extractionPrompt }],
      { 
        model: "gpt-4o-mini",
        temperature: 0,
        max_tokens: 300,
        response_format: { type: "json_object" }
      }
    );

    const extractedData = JSON.parse(extraction);
    
    // Get current metadata
    const threadResponse = await axios.get(
      `${BASE_URL}/threads/${threadId}`,
      { headers }
    );

    const currentMetadata = threadResponse.data.metadata || {};
    
    // Merge with existing metadata, only adding non-null values
    const updatedMetadata = { ...currentMetadata };
    Object.keys(extractedData).forEach(key => {
      if (extractedData[key] && extractedData[key] !== null && extractedData[key] !== "null") {
        updatedMetadata[key] = extractedData[key];
      }
    });

    // Update thread metadata
    await axios.post(
      `${BASE_URL}/threads/${threadId}`,
      { metadata: updatedMetadata },
      { headers }
    );

    console.log(`✅ Updated thread metadata for ${userId}:`, updatedMetadata);

    // Emit socket event to notify frontend of metadata update
    const Conversation = require('../models/Conversation');
    const Customer = require('../models/Customer');
    const customer = await Customer.findOne({ phoneNumber: userId });
    if (customer) {
      const conversation = await Conversation.findOne({
        customerId: customer._id,
        status: { $in: ['open', 'assigned', 'waiting', 'closed'] }
      }).sort({ updatedAt: -1 });
      
      if (conversation) {
        io.emit('metadata_updated', {
          conversationId: conversation._id.toString(),
          userId,
          metadata: updatedMetadata
        });
        console.log(`📡 Emitted metadata update for conversation ${conversation._id}`);
      }
    }

  } catch (error) {
    console.error("⚠️ Error updating thread metadata:", error.message);
    // Don't throw - metadata update is not critical
  }
}

// ============================================
// MAIN FUNCTION
// ============================================
async function getAIResponse(message, userId, context = {}, conversationId = null) {
  if (!OPENAI_API_KEY || !OPENAI_ASSISTANT_ID) throw new Error("OpenAI config missing");

  const headers = {
    Authorization: `Bearer ${OPENAI_API_KEY}`,
    "Content-Type": "application/json",
    "OpenAI-Beta": "assistants=v2",
  };

  await waitForUserProcessing(userId);
  const processingResolver = startUserProcessing(userId);

  try {
    // Emit AI typing start
    if (conversationId) {
      io.emit('ai_typing_start', { conversationId, userId });
    }

    const threadId = await getOrCreateThread(userId, headers);
    await ensureNoActiveRun(threadId, headers);
    await addMessageToThread(threadId, message, { ...context, userId }, headers);
    const runId = await runAssistant(threadId, userId, headers);
    await handleRunStatus(threadId, runId, headers, userId);
    const response = await getAssistantResponse(threadId, runId, userId, conversationId);

    // Emit AI typing end
    if (conversationId) {
      io.emit('ai_typing_end', { conversationId, userId });
    }

    return response;
  } catch (error) {
    // Enhanced error logging
    console.error("🚨 OpenAI Service Error:", {
      message: error.message,
      userId,
      stack: error.stack,
      response: error.response?.data
    });
    
    // Return user-friendly error message
    if (error.message.includes("rate_limit_exceeded")) {
      return "Lo siento, el servicio está temporalmente ocupado. Por favor intenta de nuevo en un momento.";
    } else if (error.message.includes("invalid_api_key")) {
      return "Error de configuración del asistente. Por favor contacta al administrador.";
    } else if (error.message.includes("timeout")) {
      return "La respuesta está tomando demasiado tiempo. Por favor intenta de nuevo.";
    }
    
    return "Lo siento, hubo un error con el asistente IA.";
  } finally {
    // Ensure AI typing indicator is cleared on error
    if (conversationId) {
      io.emit('ai_typing_end', { conversationId, userId });
    }
    endUserProcessing(userId);
    if (processingResolver) processingResolver();
  }
}

/**
 * Get chat completion from OpenAI (non-assistant, for analysis)
 */
async function getChatCompletion(messages, options = {}) {
  try {
    const {
      model = 'gpt-4o-mini',
      temperature = 0.7,
      max_tokens = 2000,
      response_format = null
    } = options;

    const payload = {
      model,
      messages,
      temperature,
      max_tokens
    };

    if (response_format) {
      payload.response_format = response_format;
    }

    const response = await axios.post(
      `${BASE_URL}/chat/completions`,
      payload,
      {
        headers: {
          'Authorization': `Bearer ${OPENAI_API_KEY}`,
          'Content-Type': 'application/json'
        },
        timeout: 30000
      }
    );

    return response.data.choices[0].message.content;

  } catch (error) {
    console.error("❌ OpenAI Chat Completion Error:", error.response?.data || error.message);
    throw error;
  }
}

/**
 * Get thread metadata from OpenAI Assistant
 * This includes customer information collected by the AI
 */
async function getThreadMetadata(userId) {
  try {
    if (!OPENAI_API_KEY || !OPENAI_ASSISTANT_ID) {
      throw new Error("OpenAI config missing");
    }

    const headers = {
      Authorization: `Bearer ${OPENAI_API_KEY}`,
      "Content-Type": "application/json",
      "OpenAI-Beta": "assistants=v2",
    };

    // Get thread ID from cache or database
    let threadId = userThreads.get(userId);
    
    if (!threadId) {
      const userThread = await UserThread.findOne({ userId });
      if (userThread) {
        threadId = userThread.threadId;
      } else {
        return null; // No thread exists yet
      }
    }

    // Retrieve thread details from OpenAI
    const threadResponse = await axios.get(
      `${BASE_URL}/threads/${threadId}`,
      { headers }
    );

    return {
      threadId,
      metadata: threadResponse.data.metadata || {},
      createdAt: threadResponse.data.created_at
    };

  } catch (error) {
    console.error("❌ Error fetching thread metadata:", error.response?.data || error.message);
    return null;
  }
}

/**
 * Get count of active users with threads
 * Returns the number of users currently in the thread management system
 */
async function getActiveUsersCount() {
  try {
    const UserThread = require('../models/UserThread');
    const count = await UserThread.countDocuments();
    return count;
  } catch (error) {
    console.error("❌ Error getting active users count:", error.message);
    return 0;
  }
}

module.exports = { getAIResponse, getChatCompletion, getThreadMetadata, getActiveUsersCount };
