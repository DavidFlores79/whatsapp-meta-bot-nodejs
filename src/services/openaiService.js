const axios = require("axios");
const OpenAI = require("openai");
const UserThread = require("../models/UserThread");
const Message = require("../models/Message");
const Conversation = require("../models/Conversation");
const Customer = require("../models/Customer");
const { io } = require("../models/server");
const configurationService = require("./configurationService");
const ticketService = require("./ticketService");
const { getToolsForPreset } = require("../shared/toolDefinitions");

const OPENAI_API_KEY = process.env.OPENAI_API_KEY;

const openai = new OpenAI({ apiKey: OPENAI_API_KEY });

// In-memory cache: userId -> OpenAI Conversations API conversation ID
const userConversations = new Map();

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
// Configuration for message management (kept for reference, no longer used)
const MAX_MESSAGES_PER_THREAD = 10;
const CLEANUP_THRESHOLD = 15;

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

// ============================================
// CONVERSATION MANAGEMENT (Responses API)
// Replaces: thread creation, message adding, run polling
// ============================================

/**
 * Get or create an OpenAI Conversations API conversation for a user.
 * Conversations are persisted in MongoDB and cached in-memory.
 * Replaces: getOrCreateThread / getOrCreateThreadFromDB
 */
async function getOrCreateConversation(userId) {
  // 1. Check in-memory cache
  let conversationId = userConversations.get(userId);
  if (conversationId) return conversationId;

  // 2. Check MongoDB
  try {
    const userThread = await UserThread.findOne({ userId });
    if (userThread?.conversationId) {
      conversationId = userThread.conversationId;
      userConversations.set(userId, conversationId);
      console.log(`📂 Loaded existing conversation ${conversationId} for user ${userId}`);
      return conversationId;
    }
  } catch (dbError) {
    console.error("DB error loading conversation:", dbError.message);
  }

  // 3. Create new OpenAI Conversation
  const conversation = await openai.conversations.create({
    metadata: { user_id: userId, phone_number: userId }
  });
  conversationId = conversation.id;
  userConversations.set(userId, conversationId);
  console.log(`🆕 Created new conversation ${conversationId} for user ${userId}`);

  // 4. Persist to MongoDB
  try {
    const existing = await UserThread.findOne({ userId });
    if (existing) {
      await UserThread.updateOne({ userId }, { $set: { conversationId, lastInteraction: Date.now() } });
    } else {
      await UserThread.create({ userId, conversationId, messageCount: 1 });
    }
  } catch (dbError) {
    console.error("DB error saving conversation:", dbError.message);
  }

  return conversationId;
}

/**
 * Build the Responses API input items array from a message and optional context.
 * Handles rich content: images and location data.
 */
function buildInputItems(message, context) {
  if (!context || (!context.imageUrl && !context.location)) {
    return [{ role: 'user', content: message }];
  }

  const contentParts = [{ type: 'input_text', text: message }];

  if (context.imageUrl) {
    contentParts.push({ type: 'input_image', image_url: context.imageUrl, detail: 'auto' });
    if (context.imageCaption) {
      contentParts.push({ type: 'input_text', text: `[Image caption: ${context.imageCaption}]` });
    }
  }

  if (context.location) {
    const parts = [];
    if (context.location.formatted_address) parts.push(`Address: ${context.location.formatted_address}`);
    if (context.location.coordinates_string) parts.push(`Coords: ${context.location.coordinates_string}`);
    if (parts.length) contentParts.push({ type: 'input_text', text: `[Location: ${parts.join(', ')}]` });
  }

  return [{ role: 'user', content: contentParts }];
}

/**
 * Extract the assistant's text from a Responses API response object.
 */
function extractResponseText(response) {
  if (!response?.output) return 'No response from AI.';
  for (const item of response.output) {
    if (item.type === 'message') {
      const textContent = (item.content || []).find(c => c.type === 'output_text');
      if (textContent?.text) return textContent.text;
    }
  }
  return 'No response from AI.';
}

/**
 * Execute a single tool call by name and return the result as a plain JS object.
 * The tool call loop and JSON serialization are handled by createResponse().
 * Business logic is identical to the former handleToolCalls inner loop.
 */
async function executeToolCall(functionName, args, userId) {
  console.log(`🔧 Processing tool call: ${functionName}`);
  console.log(`🔧 Raw arguments: ${JSON.stringify(args)}`);

  const ticketSvc = require('./ticketService');
  const configService = require('./configurationService');
  const CustomerModel = require('../models/Customer');

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
          const customer = await CustomerModel.findOne({ phoneNumber: userId });
          if (!customer) {
            output = JSON.stringify({
              success: false,
              error: `No se pudo crear el ${terminology.ticketSingular}. Cliente no encontrado.`
            });
          } else {
            // Check if customer has a recently resolved ticket that should be reopened instead
            const recentResolvedTicket = await ticketSvc.findRecentResolvedTicket(customer._id);

            if (recentResolvedTicket) {
              // Reopen the existing ticket instead of creating a new one
              console.log(`🔄 Found recent resolved ticket ${recentResolvedTicket.ticketId}, reopening instead of creating new ticket`);

              const reopenedTicket = await ticketSvc.reopenTicket(
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

              const ticket = await ticketSvc.createTicketFromAI({
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
        const customer = await CustomerModel.findOne({ phoneNumber: phoneToSearch });
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
            const ticket = await ticketSvc.getTicketById(normalizedTicketId);

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

            const result = await ticketSvc.getTicketsByCustomer(customer._id, queryOptions);

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

  return output;
}

/**
 * Create an AI response using the Responses API, handling the full tool call loop.
 * Replaces: runAssistant + pollRunCompletion + handleRunStatus + getAssistantResponse
 */
async function createResponse(conversationId, inputItems, instructions, tools, userId) {
  let response = await openai.responses.create({
    model: OPENAI_MODEL,
    instructions,
    tools,
    tool_choice: 'auto',
    conversation: conversationId,
    input: inputItems,
    truncation: 'auto'
  });

  // Tool call loop — max 5 iterations to prevent infinite loops
  let iterations = 0;
  while (iterations < 5) {
    const toolCalls = (response.output || []).filter(item => item.type === 'function_call');
    if (toolCalls.length === 0) break;

    console.log(`🔧 Processing ${toolCalls.length} tool call(s) from AI, iteration ${iterations + 1}`);

    const toolOutputItems = [];
    for (const call of toolCalls) {
      const args = JSON.parse(call.arguments || '{}');
      const toolOutput = await executeToolCall(call.name, args, userId);
      toolOutputItems.push({
        type: 'function_call_output',
        call_id: call.call_id,
        output: toolOutput  // already a JSON string from executeToolCall
      });
    }

    response = await openai.responses.create({
      model: OPENAI_MODEL,
      previous_response_id: response.id,
      conversation: conversationId,
      input: toolOutputItems,
      truncation: 'auto'
    });
    iterations++;
  }

  return response;
}

// ============================================
// CONVERSATION METADATA
// ============================================

/**
 * Extract customer info from recent messages and store in OpenAI Conversation metadata.
 * Replaces updateThreadMetadataFromConversation.
 */
async function updateConversationMetadata(conversationId, userId) {
  try {
    const CustomerModel = require('../models/Customer');
    const customer = await CustomerModel.findOne({ phoneNumber: userId });
    if (!customer) return;

    // Fetch recent messages from local MongoDB
    const recentMessages = await Message.find({ customerId: customer._id })
      .sort({ createdAt: -1 })
      .limit(20)
      .lean();

    if (recentMessages.length === 0) return;

    const conversationText = recentMessages
      .reverse()
      .map(m => `${m.direction === 'inbound' ? 'customer' : 'assistant'}: ${typeof m.content === 'string' ? m.content : JSON.stringify(m.content)}`)
      .join('\n');

    const extractionResponse = await openai.responses.create({
      model: 'gpt-4o-mini',
      instructions: 'Extract ONLY explicitly mentioned customer information. Return ONLY valid JSON.',
      input: `Analyze this conversation and extract ONLY the following if explicitly mentioned. Return ONLY a JSON object (null for missing):{"customer_name":"full name","email":"email","address":"full address","city":"city","issue_type":"billing|support|sales","product_interest":"product or service"}\n\nConversation:\n${conversationText}`,
      max_output_tokens: 300,
      store: false
    });

    const outputText = extractResponseText(extractionResponse);
    let extractedData;
    try {
      extractedData = JSON.parse(outputText);
    } catch {
      console.error('⚠️ Failed to parse metadata extraction response');
      return;
    }

    const currentConv = await openai.conversations.retrieve(conversationId);
    const currentMetadata = currentConv.metadata || {};
    const updatedMetadata = { ...currentMetadata };
    Object.keys(extractedData).forEach(key => {
      if (extractedData[key] && extractedData[key] !== null && extractedData[key] !== 'null') {
        updatedMetadata[key] = extractedData[key];
      }
    });

    await openai.conversations.update(conversationId, { metadata: updatedMetadata });
    console.log(`✅ Updated conversation metadata for ${userId}:`, updatedMetadata);

    const conv = await Conversation.findOne({
      customerId: customer._id,
      status: { $in: ['open', 'assigned', 'waiting', 'closed'] }
    }).sort({ updatedAt: -1 });

    if (conv) {
      io.emit('metadata_updated', {
        conversationId: conv._id.toString(),
        userId,
        metadata: updatedMetadata
      });
      console.log(`📡 Emitted metadata update for conversation ${conv._id}`);
    }
  } catch (error) {
    console.error('⚠️ Error updating conversation metadata:', error.message);
    // Non-critical — do not throw
  }
}

// ============================================
// MAIN FUNCTION
// ============================================
async function getAIResponse(message, userId, context = {}, conversationId = null) {
  if (!process.env.OPENAI_API_KEY) throw new Error("OpenAI API key missing");

  await waitForUserProcessing(userId);
  const processingResolver = startUserProcessing(userId);

  try {
    if (conversationId) io.emit('ai_typing_start', { conversationId, userId });

    // Detect language and get/create conversation in parallel
    const [detectedLanguage, openaiConversationId] = await Promise.all([
      detectLanguage(message),
      getOrCreateConversation(userId)
    ]);

    const instructions = await buildAdditionalInstructions(userId, detectedLanguage);
    const activePresetId = await configurationService.getActivePresetId();
    const tools = getToolsForPreset(activePresetId);

    console.log(`📝 AI response for user ${userId} (lang: ${detectedLanguage}, preset: ${activePresetId}, tools: ${tools.map(t => t.name).join(', ')})`);

    const inputItems = buildInputItems(message, context);
    const response = await createResponse(openaiConversationId, inputItems, instructions, tools, userId);
    const responseText = extractResponseText(response);

    // Update message count and metadata (non-blocking)
    UserThread.updateOne({ userId }, { $inc: { messageCount: 1 }, $set: { lastInteraction: Date.now() } }).catch(() => {});
    updateConversationMetadata(openaiConversationId, userId).catch(err =>
      console.error('⚠️ Metadata update error:', err.message)
    );

    if (conversationId) io.emit('ai_typing_end', { conversationId, userId });

    return responseText;
  } catch (error) {
    console.error("🚨 OpenAI Service Error:", {
      message: error.message,
      userId,
      stack: error.stack,
      response: error.response?.data || error.status
    });

    if (error.message?.includes("rate_limit_exceeded") || error.status === 429) {
      return "Lo siento, el servicio está temporalmente ocupado. Por favor intenta de nuevo en un momento.";
    } else if (error.message?.includes("invalid_api_key") || error.status === 401) {
      return "Error de configuración del asistente. Por favor contacta al administrador.";
    } else if (error.message?.includes("timeout")) {
      return "La respuesta está tomando demasiado tiempo. Por favor intenta de nuevo.";
    }

    return "Lo siento, hubo un error con el asistente IA.";
  } finally {
    if (conversationId) io.emit('ai_typing_end', { conversationId, userId });
    endUserProcessing(userId);
    if (processingResolver) processingResolver();
  }
}

/**
 * Get a single AI completion (non-conversational, for internal analysis tasks).
 */
async function getChatCompletion(messages, options = {}) {
  try {
    const {
      model = 'gpt-4o-mini',
      temperature = 0.7,
      max_tokens = 2000,
      response_format = null
    } = options;

    const systemMsg = messages.find(m => m.role === 'system');
    const otherMessages = messages.filter(m => m.role !== 'system');

    const payload = {
      model,
      instructions: systemMsg?.content || undefined,
      input: otherMessages.map(m => ({
        role: m.role === 'assistant' ? 'assistant' : 'user',
        content: m.content
      })),
      max_output_tokens: max_tokens,
      store: false
    };

    if (response_format?.type === 'json_object') {
      payload.text = { format: { type: 'json_object' } };
    }

    const response = await openai.responses.create(payload);
    return extractResponseText(response);

  } catch (error) {
    console.error("❌ OpenAI Completion Error:", error.message);
    throw error;
  }
}

/**
 * Get conversation metadata from the OpenAI Conversations API.
 * Replaces getThreadMetadata.
 */
async function getConversationMetadata(userId) {
  try {
    if (!process.env.OPENAI_API_KEY) throw new Error("OpenAI API key missing");

    let conversationId = userConversations.get(userId);
    if (!conversationId) {
      const userThread = await UserThread.findOne({ userId });
      if (userThread?.conversationId) {
        conversationId = userThread.conversationId;
      } else {
        return null; // No conversation exists yet
      }
    }

    const conversation = await openai.conversations.retrieve(conversationId);
    return {
      conversationId,
      metadata: conversation.metadata || {},
      createdAt: conversation.created_at
    };

  } catch (error) {
    console.error("❌ Error fetching conversation metadata:", error.message);
    return null;
  }
}

// Backward-compatible alias for callers that use getThreadMetadata
const getThreadMetadata = getConversationMetadata;

/**
 * Get count of users with active conversations.
 */
async function getActiveUsersCount() {
  try {
    return await UserThread.countDocuments();
  } catch (error) {
    console.error("❌ Error getting active users count:", error.message);
    return 0;
  }
}

module.exports = { getAIResponse, getChatCompletion, getThreadMetadata, getActiveUsersCount };
