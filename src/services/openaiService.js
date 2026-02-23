const axios = require("axios");
const UserThread = require("../models/UserThread");
const Message = require("../models/Message");
const Conversation = require("../models/Conversation");
const Customer = require("../models/Customer");
const { io } = require("../models/server");
const configurationService = require("./configurationService");
const ticketService = require("./ticketService");
const { getToolsForPreset } = require("../shared/toolDefinitions");

const OPENAI_API_KEY = process.env.OPENAI_API_KEY;

// ============================================
// LANGUAGE DETECTION (using GPT-4o-mini)
// ============================================
/**
 * Detect language of text using GPT-4o-mini
 * Returns ISO 639-1 language code (e.g., 'en', 'es', 'fr', 'pt')
 */
async function detectLanguage(text) {
  if (!text || text.trim().length < 2) return 'es'; // Default to Spanish for empty/short text

  try {
    const response = await axios.post(
      `https://api.openai.com/v1/chat/completions`,
      {
        model: 'gpt-4o-mini',
        messages: [
          {
            role: 'system',
            content: 'You are a language detector. Respond with ONLY the ISO 639-1 two-letter language code (e.g., en, es, fr, pt, de, it, zh, ja, ko, ar, ru). No explanation, just the code.'
          },
          {
            role: 'user',
            content: `Detect the language: "${text}"`
          }
        ],
        temperature: 0,
        max_tokens: 5
      },
      {
        headers: {
          'Authorization': `Bearer ${OPENAI_API_KEY}`,
          'Content-Type': 'application/json'
        },
        timeout: 5000 // 5 second timeout for fast response
      }
    );

    const detectedLang = response.data.choices[0].message.content.trim().toLowerCase().substring(0, 2);
    console.log(`🌐 Language detected: "${detectedLang}" for message: "${text.substring(0, 40)}${text.length > 40 ? '...' : ''}"`);
    return detectedLang;

  } catch (error) {
    console.error('⚠️ Language detection error, defaulting to Spanish:', error.message);
    return 'es'; // Default to Spanish on error
  }
}
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

/**
 * Interpolate template variables in instructions
 * Replaces {variableName} with actual values from config
 */
function interpolateInstructions(template, assistantConfig, terminology) {
  if (!template) return '';

  const variables = {
    // Assistant config variables
    assistantName: assistantConfig.assistantName || 'Assistant',
    companyName: assistantConfig.companyName || 'Company',
    primaryServiceIssue: assistantConfig.primaryServiceIssue || 'issues and requests',
    serviceType: assistantConfig.serviceType || 'service',
    ticketNoun: assistantConfig.ticketNoun || 'ticket',
    ticketNounPlural: assistantConfig.ticketNounPlural || 'tickets',
    greetingMessage: assistantConfig.greetingMessage || '',

    // Terminology variables
    ticketSingular: terminology.ticketSingular || 'ticket',
    ticketPlural: terminology.ticketPlural || 'tickets',
    createVerb: terminology.createVerb || 'create',
    customerNoun: terminology.customerNoun || 'customer',
    agentNoun: terminology.agentNoun || 'agent',
    resolveVerb: terminology.resolveVerb || 'resolve'
  };

  // Replace all {variableName} patterns
  return template.replace(/\{(\w+)\}/g, (match, key) => {
    return variables[key] !== undefined ? variables[key] : match;
  });
}

/**
 * Build additional instructions by combining database config with runtime data
 */
async function buildAdditionalInstructions(userId, detectedLanguage = 'es') {
  try {
    // Fetch configurations from database
    const [assistantConfig, terminology, instructionsTemplate] = await Promise.all([
      configurationService.getAssistantConfig(),
      configurationService.getTicketTerminology(),
      configurationService.getInstructionsTemplate()
    ]);

    // Interpolate template with actual values
    const baseInstructions = interpolateInstructions(instructionsTemplate, assistantConfig, terminology);

    // Map language codes to full names
    const languageNames = {
      'en': 'English',
      'es': 'Spanish',
      'fr': 'French',
      'pt': 'Portuguese',
      'de': 'German',
      'it': 'Italian',
      'zh': 'Chinese',
      'ja': 'Japanese',
      'ko': 'Korean',
      'ar': 'Arabic',
      'ru': 'Russian'
    };
    const languageName = languageNames[detectedLanguage] || languageNames['es'];

    // Combine database instructions with runtime context
    return `${baseInstructions}

---

**RUNTIME CONTEXT:**
- The user's WhatsApp phone number is: ${userId}
- Company: ${assistantConfig.companyName || 'Company'}
- Assistant Name: ${assistantConfig.assistantName || 'Assistant'}

**CRITICAL LANGUAGE INSTRUCTION - THIS OVERRIDES ALL OTHER INSTRUCTIONS:**
The user's message was detected as ${languageName.toUpperCase()} (${detectedLanguage}).
You MUST respond ENTIRELY in ${languageName.toUpperCase()}.
Do NOT respond in any other language.
Do NOT mix languages.
Every word of your response must be in ${languageName}.
This is a strict requirement that cannot be ignored.`;

  } catch (error) {
    console.error('⚠️ Error building instructions from DB, using fallback:', error.message);
    // Fallback to basic instructions if DB fails
    const languageNames = {
      'en': 'English', 'es': 'Spanish', 'fr': 'French', 'pt': 'Portuguese'
    };
    const languageName = languageNames[detectedLanguage] || 'Spanish';

    return `The user's WhatsApp phone number is: ${userId}.

**CRITICAL LANGUAGE INSTRUCTION:**
You MUST respond ENTIRELY in ${languageName.toUpperCase()}.`;
  }
}

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

async function runAssistant(threadId, userId, headers, detectedLanguage = 'es') {
  // Build instructions from database configuration + runtime context
  const dynamicInstructions = await buildAdditionalInstructions(userId, detectedLanguage);

  // Resolve the active preset and pick the matching tool set.
  // By passing `tools` at run-creation time we OVERRIDE the assistant's global
  // tool list, so the model can only invoke functions that belong to this preset.
  const activePresetId = await configurationService.getActivePresetId();
  const allowedTools = getToolsForPreset(activePresetId);

  console.log(`📝 Using database instructions for user ${userId} (lang: ${detectedLanguage}, preset: ${activePresetId}, tools: ${allowedTools.map(t => t.function.name).join(', ')})`);

  const runResponse = await axios.post(
    `${BASE_URL}/threads/${threadId}/runs`,
    {
      assistant_id: OPENAI_ASSISTANT_ID,
      // OVERRIDE the assistant's base instructions with database-driven ones
      instructions: dynamicInstructions,
      // OVERRIDE the assistant's registered tools with only the preset-allowed subset.
      // This is the hard enforcement layer: even if the prompt somehow asked for a
      // disallowed function, OpenAI will reject the call because the tool isn't listed.
      tools: allowedTools,
      tool_choice: 'auto'
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
  console.log(`🔧 handleToolCalls called with ${toolCalls.length} tool call(s)`);

  const ticketService = require('./ticketService');
  const configService = require('./configurationService');
  const Customer = require('../models/Customer');
  const UserThread = require('../models/UserThread');

  const toolOutputs = [];

  for (const call of toolCalls) {
    const functionName = call.function.name;
    console.log(`🔧 Processing tool call: ${functionName}`);
    console.log(`🔧 Raw arguments string: ${call.function.arguments}`);

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
            // Check if customer has a recently resolved ticket that should be reopened instead
            const recentResolvedTicket = await ticketService.findRecentResolvedTicket(customer._id);

            if (recentResolvedTicket) {
              // Reopen the existing ticket instead of creating a new one
              console.log(`🔄 Found recent resolved ticket ${recentResolvedTicket.ticketId}, reopening instead of creating new ticket`);

              const reopenedTicket = await ticketService.reopenTicket(
                recentResolvedTicket.ticketId,
                `Customer reported: ${subject}. ${description}`
              );

              output = JSON.stringify({
                success: true,
                ticketId: reopenedTicket.ticketId,
                message: `Tu ${terminology.ticketSingular} anterior ${reopenedTicket.ticketId} ha sido reabierto. Continuaremos ayudándote con este caso.`,
                reopened: true,
                reopenCount: reopenedTicket.reopenCount
              });
            } else {
              // No recent resolved ticket, create a new one
              // Find the active conversation for this customer
              const activeConversation = await Conversation.findOne({ 
                customerId: customer._id,
                status: { $in: ['open', 'assigned', 'waiting'] }
              }).sort({ updatedAt: -1 });
              
              const conversationId = activeConversation ? activeConversation._id : null;

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
                message: `${terminology.ticketSingular} creado exitosamente con ID: ${ticket.ticketId}`,
                reopened: false
              });
            }
          }
        }
      } else if (functionName === "get_ticket_information") {
        const terminology = await configService.getTicketTerminology();

        // Debug: Log all arguments received from OpenAI
        console.log(`🔍 get_ticket_information - Raw arguments:`, JSON.stringify(args, null, 2));

        // Determine which phone number to use for customer lookup
        // If phone_number is provided in args AND different from userId, use it
        // Otherwise use the conversation's userId (current customer)
        const phoneToSearch = args.phone_number || userId;

        console.log(`   Searching with phone: ${phoneToSearch}`);
        console.log(`   Filters: ticket_id=${args.ticket_id}, lookup_recent=${args.lookup_recent}, exclude_closed=${args.exclude_closed}, include_notes=${args.include_notes}`);

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
              console.log(`   ❌ Ticket not found: ${normalizedTicketId}`);
              output = JSON.stringify({
                success: false,
                error: `${terminology.ticketSingular} con ID "${normalizedTicketId}" no encontrado.`
              });
            } else if (!ticket.customerId) {
              // Ticket exists but has no customer linked (orphaned ticket)
              console.log(`   ⚠️ Ticket ${normalizedTicketId} has no customer linked`);
              output = JSON.stringify({
                success: false,
                error: `El ${terminology.ticketSingular} "${normalizedTicketId}" no tiene un cliente asociado.`
              });
            } else {
              // Extract customer ID from ticket (handle both populated and unpopulated)
              const ticketCustomerId = (ticket.customerId._id || ticket.customerId).toString();
              const currentCustomerId = customer._id.toString();

              if (ticketCustomerId !== currentCustomerId) {
                // Ticket exists but belongs to different customer
                console.log(`   ❌ Access denied - Ticket customer ID: ${ticketCustomerId}, Current customer ID: ${currentCustomerId}`);
                console.log(`   Ticket belongs to phone: ${ticket.customerId.phoneNumber || 'unknown'}`);
                console.log(`   Current customer phone: ${customer.phoneNumber}`);
                output = JSON.stringify({
                  success: false,
                  error: `No tienes acceso al ${terminology.ticketSingular} "${normalizedTicketId}". Este ${terminology.ticketSingular} pertenece a otro cliente.`
                });
              } else {
                // Ticket found and customer has access
                console.log(`   ✅ Access granted - Customer has access to ticket ${normalizedTicketId}`);
                console.log(`   Ticket status: ${ticket.status}, Priority: ${ticket.priority}`);

              // Filter notes to only include external notes (not internal agent notes)
              const externalNotes = ticket.notes
                ? ticket.notes
                    .filter(note => !note.isInternal)
                    .map(note => ({
                      content: note.content,
                      timestamp: note.timestamp,
                      agent: note.agent ? `${note.agent.firstName} ${note.agent.lastName}` : 'Agent'
                    }))
                : [];

              console.log(`   External notes count: ${externalNotes.length}`);

              // Translate status for better customer understanding
              const statusTranslations = {
                'new': 'Nuevo',
                'open': 'Abierto',
                'in_progress': 'En Progreso',
                'pending_customer': 'Esperando Respuesta del Cliente',
                'waiting_internal': 'En Proceso Interno',
                'resolved': 'Resuelto',
                'closed': 'Cerrado'
              };

              const priorityTranslations = {
                'low': 'Baja',
                'medium': 'Media',
                'high': 'Alta',
                'urgent': 'Urgente'
              };

              output = JSON.stringify({
                success: true,
                ticket: {
                  ticketId: ticket.ticketId,
                  subject: ticket.subject,
                  description: ticket.description,
                  status: ticket.status,
                  statusText: statusTranslations[ticket.status] || ticket.status,
                  priority: ticket.priority,
                  priorityText: priorityTranslations[ticket.priority] || ticket.priority,
                  category: ticket.category,
                  createdAt: ticket.createdAt,
                  assignedAgent: ticket.assignedAgent ? `${ticket.assignedAgent.firstName} ${ticket.assignedAgent.lastName}` : null,
                  notes: externalNotes,
                  notesCount: externalNotes.length,
                  lastUpdate: ticket.lastActivityAt || ticket.updatedAt
                }
              });
              }
            }
          } else if (args.lookup_recent) {
            // Get recent tickets with optional filters
            const queryOptions = { limit: args.limit || 5 };

            // Support status filtering
            if (args.status) {
              queryOptions.status = args.status;
            }

            // Support exclude_closed filter
            if (args.exclude_closed) {
              queryOptions.excludeStatus = 'closed';
            }

            // Support include_notes filter
            const includeNotes = args.include_notes || false;

            const result = await ticketService.getTicketsByCustomer(customer._id, queryOptions);

            const ticketResults = result.tickets.map(t => {
              const ticketData = {
                ticketId: t.ticketId,
                subject: t.subject,
                status: t.status,
                priority: t.priority,
                createdAt: t.createdAt,
                lastUpdate: t.lastActivityAt || t.updatedAt
              };

              // Include notes if requested (only external notes)
              if (includeNotes && t.notes) {
                ticketData.notes = t.notes
                  .filter(note => !note.isInternal)
                  .map(note => ({
                    content: note.content,
                    timestamp: note.timestamp
                  }));
                ticketData.notesCount = ticketData.notes.length;
              }

              return ticketData;
            });

            console.log(`   ✅ Found ${ticketResults.length} tickets for customer`);
            if (includeNotes) {
              const totalNotes = ticketResults.reduce((sum, t) => sum + (t.notesCount || 0), 0);
              console.log(`   📝 Total external notes: ${totalNotes}`);
            }

            output = JSON.stringify({
              success: true,
              tickets: ticketResults,
              total: result.total
            });
          } else {
            output = JSON.stringify({
              success: false,
              error: 'Debes proporcionar un ID de ticket o solicitar tickets recientes.'
            });
          }
        }
      } else if (
        functionName === "get_ecommerce_order" || 
        functionName === "search_ecommerce_products" ||
        functionName === "create_ecommerce_order" ||
        functionName === "get_active_orders"
      ) {
        // E-commerce integration functions (only work with compatible presets)
        const { handleEcommerceFunction } = require('../handlers/ecommerceFunctionHandler');
        const result = await handleEcommerceFunction(functionName, args);
        output = JSON.stringify(result);

      } else if (
        functionName === "create_clinical_analysis_request" ||
        functionName === "get_clinical_analysis_results"
      ) {
        // ─────────────────────────────────────────────────────────────────
        // Healthcare: Clinical Analysis Tools  (MOCK implementation)
        // TODO: Replace mock responses with real laboratory system integration
        // ─────────────────────────────────────────────────────────────────

        if (functionName === "create_clinical_analysis_request") {
          const { patient_name, patient_phone, analysis_types = [], doctor_name, preparation_notes, preferred_date, date_of_birth } = args;

          if (!patient_name || !patient_phone || analysis_types.length === 0) {
            output = JSON.stringify({
              success: false,
              error: 'Faltan datos requeridos: nombre del paciente, teléfono y al menos un tipo de análisis.'
            });
          } else {
            // Mock: generate a reference number for this request
            const year = new Date().getFullYear();
            const seq = String(Math.floor(Math.random() * 900000) + 100000);
            const referenceNumber = `CLN-${year}-${seq}`;

            // Mock: estimated ready date (3 business days from today)
            const readyDate = new Date();
            readyDate.setDate(readyDate.getDate() + 3);
            const readyDateStr = readyDate.toLocaleDateString('es-MX', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });

            // Mock: derive generic preparation guidelines per analysis type
            const fastingRequired = analysis_types.some(t =>
              ['glucose', 'liver_panel', 'kidney_panel', 'lipid_panel', 'hba1c', 'blood_count'].includes(t)
            );

            const analysisLabels = {
              blood_count: 'Biometría Hemática Completa',
              glucose: 'Glucosa en Sangre',
              liver_panel: 'Panel Hepático',
              kidney_panel: 'Panel Renal',
              thyroid_panel: 'Panel Tiroideo (TSH, T3, T4)',
              lipid_panel: 'Panel de Lípidos (Colesterol, Triglicéridos)',
              urine_general: 'Examen General de Orina',
              urine_culture: 'Urocultivo',
              stool_general: 'Examen General de Heces',
              stool_culture: 'Coprocultivo',
              pregnancy_test: 'Prueba de Embarazo (HCG)',
              hba1c: 'Hemoglobina Glucosilada (HbA1c)',
              covid_pcr: 'PCR COVID-19',
              covid_antigen: 'Antígeno COVID-19',
              other: 'Análisis Adicional'
            };

            const analysisNames = analysis_types.map(t => analysisLabels[t] || t);

            console.log(`🧪 [MOCK] Clinical analysis request created: ${referenceNumber} for ${patient_name}`);

            output = JSON.stringify({
              success: true,
              mock: true, // ← remove once real service is integrated
              referenceNumber,
              patientName: patient_name,
              analyses: analysisNames,
              doctorName: doctor_name || null,
              preferredDate: preferred_date || null,
              estimatedReadyDate: readyDateStr,
              preparationInstructions: fastingRequired
                ? 'Se requiere ayuno de 8 a 12 horas antes de la toma de muestra. Solo agua simple está permitida durante el ayuno.'
                : 'No se requiere ayuno especial. Sigue las indicaciones de tu médico.',
              collectionInfo: 'Preséntate en el laboratorio con este número de referencia y una identificación oficial. Horario: Lunes a Viernes 7:00 AM – 2:00 PM, Sábados 7:00 AM – 12:00 PM.',
              message: `Solicitud registrada exitosamente con número de referencia ${referenceNumber}. Los resultados estarán listos aproximadamente el ${readyDateStr}.`
            });
          }

        } else if (functionName === "get_clinical_analysis_results") {
          const { reference_number, patient_phone: searchPhone, lookup_recent, include_results } = args;
          const phoneToSearch = searchPhone || userId;

          if (!reference_number && !lookup_recent) {
            output = JSON.stringify({
              success: false,
              error: 'Debes proporcionar un número de referencia o solicitar análisis recientes.'
            });
          } else if (reference_number) {
            // Mock: single analysis lookup by reference number
            const normalizedRef = reference_number.toUpperCase().trim();
            console.log(`🧪 [MOCK] Clinical analysis lookup: ${normalizedRef} for phone ${phoneToSearch}`);

            // Mock response — simulates a completed blood count + glucose
            output = JSON.stringify({
              success: true,
              mock: true, // ← remove once real service is integrated
              referenceNumber: normalizedRef,
              patientName: 'Paciente (Mock)',
              status: 'ready',
              statusText: 'Resultados Disponibles',
              requestedDate: new Date(Date.now() - 3 * 24 * 60 * 60 * 1000).toLocaleDateString('es-MX'),
              readyDate: new Date().toLocaleDateString('es-MX'),
              analyses: include_results ? [
                {
                  name: 'Biometría Hemática Completa',
                  status: 'ready',
                  values: [
                    { parameter: 'Hemoglobina', value: '14.5', unit: 'g/dL', reference: '12.0 – 17.5', flag: 'normal' },
                    { parameter: 'Leucocitos', value: '7.2', unit: 'x10³/µL', reference: '4.5 – 11.0', flag: 'normal' },
                    { parameter: 'Plaquetas', value: '250', unit: 'x10³/µL', reference: '150 – 400', flag: 'normal' }
                  ]
                },
                {
                  name: 'Glucosa en Sangre',
                  status: 'ready',
                  values: [
                    { parameter: 'Glucosa', value: '95', unit: 'mg/dL', reference: '70 – 100', flag: 'normal' }
                  ]
                }
              ] : null,
              disclaimer: '⚠️ IMPORTANTE: Estos resultados son de carácter informativo. NO los interprete por su cuenta. Comparta siempre sus resultados con su médico o especialista para una evaluación adecuada.',
              message: include_results
                ? `Los resultados de la solicitud ${normalizedRef} están disponibles. Recuerde consultar con su médico para la interpretación.`
                : `Los resultados de la solicitud ${normalizedRef} están listos. Puede solicitarlos indicando que desea ver los valores detallados.`
            });

          } else {
            // Mock: recent analyses lookup by phone
            console.log(`🧪 [MOCK] Recent analyses lookup for phone: ${phoneToSearch}`);

            output = JSON.stringify({
              success: true,
              mock: true, // ← remove once real service is integrated
              total: 2,
              analyses: [
                {
                  referenceNumber: `CLN-${new Date().getFullYear()}-100001`,
                  analyses: ['Biometría Hemática Completa', 'Glucosa en Sangre'],
                  status: 'ready',
                  statusText: 'Resultados Disponibles',
                  requestedDate: new Date(Date.now() - 3 * 24 * 60 * 60 * 1000).toLocaleDateString('es-MX')
                },
                {
                  referenceNumber: `CLN-${new Date().getFullYear()}-099847`,
                  analyses: ['Panel Tiroideo (TSH, T3, T4)'],
                  status: 'processing',
                  statusText: 'En Proceso',
                  requestedDate: new Date(Date.now() - 1 * 24 * 60 * 60 * 1000).toLocaleDateString('es-MX')
                }
              ],
              disclaimer: '⚠️ Consulte siempre con su médico para la interpretación de resultados.'
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

    // Detect language from user's message BEFORE processing
    const detectedLanguage = await detectLanguage(message);

    const threadId = await getOrCreateThread(userId, headers);
    await ensureNoActiveRun(threadId, headers);
    await addMessageToThread(threadId, message, { ...context, userId }, headers);
    const runId = await runAssistant(threadId, userId, headers, detectedLanguage);
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
