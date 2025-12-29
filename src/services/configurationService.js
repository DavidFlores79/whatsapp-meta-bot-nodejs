const SystemSettings = require('../models/SystemSettings');

class ConfigurationService {
    constructor() {
        this.cache = new Map();
        this.cacheTTL = 5 * 60 * 1000; // 5 minutes
    }

    /**
     * Get ticket categories configuration
     */
    async getTicketCategories() {
        return this.getSetting('ticket_categories', this.getDefaultCategories());
    }

    /**
     * Get assistant configuration
     */
    async getAssistantConfig() {
        return this.getSetting('assistant_configuration', this.getDefaultAssistantConfig());
    }

    /**
     * Get ticket terminology
     */
    async getTicketTerminology() {
        return this.getSetting('ticket_terminology', this.getDefaultTerminology());
    }

    /**
     * Get ticket ID format configuration
     */
    async getTicketIdFormat() {
        return this.getSetting('ticket_id_format', this.getDefaultIdFormat());
    }

    /**
     * Get assistant instructions template
     */
    async getInstructionsTemplate() {
        return this.getSetting('assistant_instructions_template', this.getDefaultInstructionsTemplate());
    }

    /**
     * Get configuration presets
     */
    async getConfigurationPresets() {
        return this.getSetting('configuration_presets', this.getDefaultPresets());
    }

    /**
     * Generic method to get setting with caching
     */
    async getSetting(key, defaultValue) {
        // Check cache
        const cached = this.cache.get(key);
        if (cached && Date.now() - cached.timestamp < this.cacheTTL) {
            return cached.value;
        }

        // Fetch from DB
        const value = await SystemSettings.getSetting(key, defaultValue);

        // Update cache
        this.cache.set(key, { value, timestamp: Date.now() });
        return value;
    }

    /**
     * Update setting and invalidate cache
     */
    async updateSetting(key, value, updatedBy = null) {
        const setting = await SystemSettings.updateSetting(key, value, updatedBy);

        // Invalidate cache
        this.cache.delete(key);

        return setting;
    }

    /**
     * Invalidate cache for specific key
     */
    invalidateCache(key) {
        this.cache.delete(key);
    }

    /**
     * Clear all cache
     */
    clearCache() {
        this.cache.clear();
    }

    // ============================================
    // DEFAULT CONFIGURATIONS (LUXFREE)
    // ============================================

    getDefaultCategories() {
        return [
            {
                id: 'solar_installation',
                label: 'Instalación Solar',
                labelEn: 'Solar Installation',
                icon: 'sun',
                color: '#F59E0B',
                description: 'Instalación de paneles solares y sistemas fotovoltaicos'
            },
            {
                id: 'light_malfunction',
                label: 'Falla de Luminaria',
                labelEn: 'Light Malfunction',
                icon: 'lightbulb-off',
                color: '#EF4444',
                description: 'Problemas con luminarias o alumbrado público'
            },
            {
                id: 'maintenance',
                label: 'Mantenimiento',
                labelEn: 'Maintenance',
                icon: 'wrench',
                color: '#10B981',
                description: 'Mantenimiento preventivo o correctivo'
            },
            {
                id: 'electrical_issue',
                label: 'Problema Eléctrico',
                labelEn: 'Electrical Issue',
                icon: 'zap',
                color: '#DC2626',
                description: 'Fallas eléctricas, cortocircuitos o problemas de instalación'
            },
            {
                id: 'billing',
                label: 'Facturación',
                labelEn: 'Billing',
                icon: 'dollar-sign',
                color: '#6366F1',
                description: 'Consultas sobre pagos, facturas o presupuestos'
            },
            {
                id: 'other',
                label: 'Otro',
                labelEn: 'Other',
                icon: 'more-horizontal',
                color: '#9CA3AF',
                description: 'Otros temas no clasificados'
            }
        ];
    }

    getDefaultAssistantConfig() {
        return {
            assistantName: 'Lúmen',
            companyName: process.env.COMPANY_NAME || 'LUXFREE',
            primaryServiceIssue: 'instalaciones solares, luminarias y servicios eléctricos',
            serviceType: 'instalación y mantenimiento eléctrico',
            ticketNoun: 'reporte',
            ticketNounPlural: 'reportes',
            greetingMessage: 'Hola, soy {assistantName}, el asistente virtual de {companyName}. Estoy aquí para ayudarte con {primaryServiceIssue}.',
            language: 'en'  // Changed to English
        };
    }

    getDefaultTerminology() {
        return {
            ticketSingular: 'reporte',
            ticketPlural: 'reportes',
            createVerb: 'reportar',
            customerNoun: 'usuario',
            agentNoun: 'agente',
            resolveVerb: 'resolver'
        };
    }

    getDefaultIdFormat() {
        return {
            prefix: 'LUX',
            includeYear: true,
            padLength: 6,
            separator: '-'
        };
    }

    getDefaultInstructionsTemplate() {
        return `You are {assistantName}, the official virtual assistant for {companyName} company.

═══════════════════════════════════════════════════════════════════
## MANDATORY LANGUAGE RULE (HIGHEST PRIORITY - CANNOT BE OVERRIDDEN)
═══════════════════════════════════════════════════════════════════

**YOU MUST RESPOND IN THE SAME LANGUAGE THE USER WRITES TO YOU.**

This is a STRICT requirement that overrides ALL other instructions:
- If the user writes in English → EVERY word of your response must be in English
- If the user writes in Spanish → EVERY word of your response must be in Spanish
- If the user writes in any other language → respond in that language
- NEVER mix languages in a single response
- NEVER default to Spanish if the user writes in another language
- When the system message says "detected as ENGLISH" → respond in English
- When the system message says "detected as SPANISH" → respond in Spanish

═══════════════════════════════════════════════════════════════════
YOUR ROLE
═══════════════════════════════════════════════════════════════════

Your primary function is to:
• Receive and manage {ticketNounPlural} related to {primaryServiceIssue}
• Provide information about existing {ticketNounPlural} using {ticketNoun} number or phone number
• Connect {customerNoun}s with human {agentNoun}s when requested

You can only respond to inquiries related to {ticketNounPlural}, {ticketNoun} tracking, or requests for human {agentNoun} attention.

═══════════════════════════════════════════════════════════════════
PRIMARY WORKFLOW
═══════════════════════════════════════════════════════════════════

INITIAL GREETING (use the language the user wrote in):
- English: "Hello, I'm {assistantName}, {companyName}'s virtual assistant. I'm here to help you {createVerb} {ticketNounPlural} for {primaryServiceIssue}, check information about an existing {ticketNoun}, or connect you with an {agentNoun} if needed."
- Spanish: "Hola, soy {assistantName}, el asistente virtual de {companyName}. Estoy aquí para ayudarte a {createVerb} {ticketNounPlural} sobre {primaryServiceIssue}, consultar información sobre un {ticketNoun} existente, o conectarte con un {agentNoun} si lo necesitas."

DETERMINE USER'S NEED (in their language):
Ask what they want to do:
• {createVerb} a new {ticketNoun}?
• Check information about an existing {ticketNoun}?
• Speak with a human {agentNoun}?

═══════════════════════════════════════════════════════════════════
A) WORKFLOW FOR HUMAN AGENT REQUEST
═══════════════════════════════════════════════════════════════════

DETECTION OF REQUEST:
If the user mentions phrases like: "talk to a person", "need an agent", "talk to human", "connect me with someone", "real agent", "you're not helping", "bad service", "speak with a supervisor" (in any language)

RESPONSE (in user's language):
Acknowledge that you understand they prefer a human {agentNoun}, confirm you've notified the team, and let them know an {agentNoun} will be assigned shortly.

IMPORTANT RULES:
• Do not try to convince the user to stay with you
• Never say "sorry, I can't do that"
• Always confirm that the request was registered
• Maintain a positive and empathetic tone

═══════════════════════════════════════════════════════════════════
B) WORKFLOW FOR NEW {ticketNoun}
═══════════════════════════════════════════════════════════════════

DATA COLLECTION (in user's language):
Request one by one:
• {customerNoun}'s name
• Exact or approximate location
• Problem description
• (Optional) Contact number or email

VERIFICATION BEFORE SUBMITTING:
Show a summary of collected information and ask for confirmation.
User must respond with "CONFIRM" or "CONFIRMAR" to proceed.

MANDATORY RULE: Do not call create_ticket_report until the user explicitly confirms.

SUBMISSION AND CONFIRMATION:
Upon confirmation, use create_ticket_report and inform the {customerNoun} of their tracking number.

═══════════════════════════════════════════════════════════════════
C) WORKFLOW FOR {ticketNoun} INQUIRY
═══════════════════════════════════════════════════════════════════

OFFER SEARCH OPTIONS (in user's language):
• By {ticketNoun} number
• By associated phone number

MANDATORY NUMBER CONFIRMATION:
Always confirm the phone number before searching.
User must confirm before you use get_ticket_information.

═══════════════════════════════════════════════════════════════════
GENERAL BEHAVIOR RULES
═══════════════════════════════════════════════════════════════════

✓ LANGUAGE: Always respond in the user's language (HIGHEST PRIORITY)
✓ MANDATORY CONFIRMATION: Never use get_ticket_information without explicit confirmation
✓ AGENT REQUESTS: ALWAYS acknowledge and accept requests for human {agentNoun}s
✓ Always maintain a professional, empathetic, and positive tone
✓ Do not invent or assume information
✓ For new {ticketNounPlural}: do not execute create_ticket_report without explicit confirmation
✓ If the user says "cancel"/"cancelar", stop and offer to start over
✓ OFF-TOPIC: Politely explain you can only help with {ticketNounPlural}, {ticketNoun} inquiries, or connecting with {agentNoun}s
✓ AUTOMATIC ESCALATION: If you detect frustration, offer to connect with a human {agentNoun}`;
    }

    getDefaultPresets() {
        return [
            {
                id: 'luxfree',
                name: 'LUXFREE (Solar & Lighting)',
                description: 'Configuración para empresa de instalación solar y mantenimiento de luminarias',
                config: {
                    assistant_configuration: this.getDefaultAssistantConfig(),
                    ticket_categories: this.getDefaultCategories(),
                    ticket_terminology: this.getDefaultTerminology(),
                    ticket_id_format: this.getDefaultIdFormat(),
                    assistant_instructions_template: this.getDefaultInstructionsTemplate()
                }
            },
            {
                id: 'restaurant',
                name: 'Restaurant / Food Service',
                description: 'Configuración para restaurantes y servicios de comida',
                config: {
                    assistant_configuration: {
                        assistantName: 'FoodBot',
                        companyName: 'Restaurante',
                        primaryServiceIssue: 'problemas con pedidos, entregas o calidad de comida',
                        serviceType: 'servicio de comida',
                        ticketNoun: 'caso',
                        ticketNounPlural: 'casos',
                        language: 'es'
                    },
                    ticket_categories: [
                        { id: 'order_issue', label: 'Problema con Pedido', labelEn: 'Order Issue', icon: 'shopping-bag', color: '#EF4444', description: 'Pedido incorrecto, faltante o incompleto' },
                        { id: 'delivery_issue', label: 'Problema de Entrega', labelEn: 'Delivery Issue', icon: 'truck', color: '#F59E0B', description: 'Retraso, dirección incorrecta o pedido no entregado' },
                        { id: 'food_quality', label: 'Calidad de Comida', labelEn: 'Food Quality', icon: 'alert-circle', color: '#DC2626', description: 'Comida fría, mal preparada o en mal estado' },
                        { id: 'menu_question', label: 'Consulta de Menú', labelEn: 'Menu Question', icon: 'book-open', color: '#3B82F6', description: 'Preguntas sobre ingredientes, alérgenos o disponibilidad' },
                        { id: 'billing', label: 'Facturación', labelEn: 'Billing', icon: 'credit-card', color: '#10B981', description: 'Cobros incorrectos o solicitud de factura' },
                        { id: 'other', label: 'Otro', labelEn: 'Other', icon: 'more-horizontal', color: '#9CA3AF', description: 'Otros temas no clasificados' }
                    ],
                    ticket_terminology: {
                        ticketSingular: 'caso',
                        ticketPlural: 'casos',
                        createVerb: 'reportar',
                        customerNoun: 'cliente',
                        agentNoun: 'agente',
                        resolveVerb: 'resolver'
                    },
                    ticket_id_format: {
                        prefix: 'FOOD',
                        includeYear: false,
                        padLength: 6,
                        separator: '-'
                    },
                    assistant_instructions_template: this.getRestaurantInstructionsTemplate()
                }
            },
            {
                id: 'ecommerce',
                name: 'E-commerce / Retail',
                description: 'Configuración para tiendas en línea y retail',
                config: {
                    assistant_configuration: {
                        assistantName: 'ShopAssist',
                        companyName: 'TiendaOnline',
                        primaryServiceIssue: 'problemas con productos, envíos o devoluciones',
                        serviceType: 'compras en línea',
                        ticketNoun: 'solicitud',
                        ticketNounPlural: 'solicitudes',
                        language: 'es'
                    },
                    ticket_categories: [
                        { id: 'product_inquiry', label: 'Consulta de Producto', labelEn: 'Product Inquiry', icon: 'package', color: '#3B82F6', description: 'Preguntas sobre productos, stock o especificaciones' },
                        { id: 'return_exchange', label: 'Devolución/Cambio', labelEn: 'Return/Exchange', icon: 'repeat', color: '#F59E0B', description: 'Solicitud de devolución o cambio de producto' },
                        { id: 'shipping_issue', label: 'Problema de Envío', labelEn: 'Shipping Issue', icon: 'truck', color: '#EF4444', description: 'Retraso, paquete dañado o pedido no recibido' },
                        { id: 'payment_issue', label: 'Problema de Pago', labelEn: 'Payment Issue', icon: 'credit-card', color: '#DC2626', description: 'Cobro duplicado, rechazado o incorrecto' },
                        { id: 'product_defect', label: 'Producto Defectuoso', labelEn: 'Product Defect', icon: 'alert-triangle', color: '#B91C1C', description: 'Producto recibido con defectos o daños' },
                        { id: 'other', label: 'Otro', labelEn: 'Other', icon: 'more-horizontal', color: '#9CA3AF', description: 'Otros temas no clasificados' }
                    ],
                    ticket_terminology: {
                        ticketSingular: 'solicitud',
                        ticketPlural: 'solicitudes',
                        createVerb: 'crear',
                        customerNoun: 'cliente',
                        agentNoun: 'agente',
                        resolveVerb: 'completar'
                    },
                    ticket_id_format: {
                        prefix: 'ORD',
                        includeYear: true,
                        padLength: 6,
                        separator: '-'
                    },
                    assistant_instructions_template: this.getEcommerceInstructionsTemplate()
                }
            },
            {
                id: 'healthcare',
                name: 'Healthcare / Medical',
                description: 'Configuración para clínicas y servicios médicos',
                config: {
                    assistant_configuration: {
                        assistantName: 'MediAssist',
                        companyName: 'Clínica',
                        primaryServiceIssue: 'consultas médicas, citas o recetas',
                        serviceType: 'servicios médicos',
                        ticketNoun: 'consulta',
                        ticketNounPlural: 'consultas',
                        language: 'es'
                    },
                    ticket_categories: [
                        { id: 'appointment', label: 'Cita Médica', labelEn: 'Medical Appointment', icon: 'calendar', color: '#3B82F6', description: 'Agendar, reagendar o cancelar cita médica' },
                        { id: 'prescription', label: 'Receta Médica', labelEn: 'Prescription', icon: 'file-text', color: '#10B981', description: 'Solicitud de receta o resurtido de medicamento' },
                        { id: 'test_results', label: 'Resultados de Estudios', labelEn: 'Test Results', icon: 'activity', color: '#8B5CF6', description: 'Consulta de resultados de laboratorio o estudios' },
                        { id: 'billing_insurance', label: 'Facturación/Seguro', labelEn: 'Billing/Insurance', icon: 'shield', color: '#F59E0B', description: 'Facturación, cobertura de seguro o pagos' },
                        { id: 'general_inquiry', label: 'Consulta General', labelEn: 'General Inquiry', icon: 'help-circle', color: '#6B7280', description: 'Preguntas generales sobre servicios médicos' },
                        { id: 'other', label: 'Otro', labelEn: 'Other', icon: 'more-horizontal', color: '#9CA3AF', description: 'Otros temas no clasificados' }
                    ],
                    ticket_terminology: {
                        ticketSingular: 'consulta',
                        ticketPlural: 'consultas',
                        createVerb: 'abrir',
                        customerNoun: 'paciente',
                        agentNoun: 'médico',
                        resolveVerb: 'cerrar'
                    },
                    ticket_id_format: {
                        prefix: 'MED',
                        includeYear: true,
                        padLength: 6,
                        separator: '-'
                    },
                    assistant_instructions_template: this.getHealthcareInstructionsTemplate()
                }
            }
        ];
    }

    // ============================================
    // INDUSTRY-SPECIFIC INSTRUCTIONS TEMPLATES
    // ============================================

    getRestaurantInstructionsTemplate() {
        return `You are {assistantName}, the virtual assistant for {companyName}.

═══════════════════════════════════════════════════════════════════
## MANDATORY LANGUAGE RULE (HIGHEST PRIORITY)
═══════════════════════════════════════════════════════════════════

**YOU MUST RESPOND IN THE SAME LANGUAGE THE USER WRITES TO YOU.**
- If the user writes in English → respond entirely in English
- If the user writes in Spanish → respond entirely in Spanish
- NEVER mix languages in a single response

═══════════════════════════════════════════════════════════════════
YOUR ROLE - FOOD SERVICE ASSISTANT
═══════════════════════════════════════════════════════════════════

Your primary function is to:
• Help {customerNoun}s {createVerb} {ticketNounPlural} about {primaryServiceIssue}
• Check the status of existing {ticketNounPlural} (order issues, delivery problems)
• Connect {customerNoun}s with a human {agentNoun} when needed

You can ONLY help with:
✓ Order problems (wrong items, missing items, cold food)
✓ Delivery issues (late delivery, wrong address, driver problems)
✓ Food quality concerns
✓ Menu questions (ingredients, allergens, availability)
✓ Billing issues (incorrect charges, refund requests)
✓ Connect with human {agentNoun}

You CANNOT:
✗ Take new food orders (direct them to the ordering platform)
✗ Make reservations (provide reservation phone/system)
✗ Provide nutritional information (recommend consulting official sources)
✗ Process payments directly

═══════════════════════════════════════════════════════════════════
WORKFLOW FOR NEW {ticketNoun}
═══════════════════════════════════════════════════════════════════

DATA COLLECTION (one by one):
1. {customerNoun}'s name
2. Order number (if available)
3. Date and approximate time of order
4. Detailed description of the problem
5. Preferred resolution (refund, replacement, credit)

VERIFICATION:
Show summary and ask for confirmation with "CONFIRM" or "CONFIRMAR".
NEVER call create_ticket_report without explicit confirmation.

═══════════════════════════════════════════════════════════════════
WORKFLOW FOR {ticketNoun} INQUIRY
═══════════════════════════════════════════════════════════════════

Ask for:
• {ticketNoun} number, OR
• Phone number associated with the order

Always confirm the information before searching.
NEVER call get_ticket_information without confirmation.

═══════════════════════════════════════════════════════════════════
HUMAN AGENT REQUEST
═══════════════════════════════════════════════════════════════════

If user wants to speak with a person:
• Acknowledge immediately
• Confirm the request was registered
• Let them know an {agentNoun} will be assigned shortly
• NEVER try to convince them to stay with the bot

═══════════════════════════════════════════════════════════════════
GENERAL RULES
═══════════════════════════════════════════════════════════════════

✓ Always respond in the user's language
✓ Be empathetic about food-related frustrations
✓ Apologize sincerely for any inconvenience
✓ Prioritize urgent food safety concerns
✓ If user mentions allergic reaction → immediately offer human {agentNoun}
✓ If user says "cancel" → stop and offer to start over
✓ Detect frustration → offer human {agentNoun}`;
    }

    getEcommerceInstructionsTemplate() {
        return `You are {assistantName}, the virtual assistant for {companyName}.

═══════════════════════════════════════════════════════════════════
## MANDATORY LANGUAGE RULE (HIGHEST PRIORITY)
═══════════════════════════════════════════════════════════════════

**YOU MUST RESPOND IN THE SAME LANGUAGE THE USER WRITES TO YOU.**
- If the user writes in English → respond entirely in English
- If the user writes in Spanish → respond entirely in Spanish
- NEVER mix languages in a single response

═══════════════════════════════════════════════════════════════════
YOUR ROLE - E-COMMERCE SUPPORT ASSISTANT
═══════════════════════════════════════════════════════════════════

Your primary function is to:
• Help {customerNoun}s {createVerb} {ticketNounPlural} about {primaryServiceIssue}
• Check order status and existing {ticketNounPlural}
• Assist with returns, exchanges, and refunds
• Connect {customerNoun}s with a human {agentNoun} when needed

You can ONLY help with:
✓ Order tracking and status inquiries
✓ Shipping problems (delays, lost packages, wrong address)
✓ Return and exchange requests
✓ Payment issues (duplicate charges, failed payments, refunds)
✓ Product defects and quality issues
✓ Product availability questions
✓ Connect with human {agentNoun}

You CANNOT:
✗ Place new orders (direct to website/app)
✗ Process payments or refunds directly
✗ Provide product recommendations
✗ Access payment card information

═══════════════════════════════════════════════════════════════════
WORKFLOW FOR NEW {ticketNoun}
═══════════════════════════════════════════════════════════════════

DATA COLLECTION (one by one):
1. {customerNoun}'s name
2. Order number (mandatory for most issues)
3. Type of issue (shipping/return/payment/defect)
4. Detailed description of the problem
5. Preferred resolution (refund, replacement, store credit)
6. Photos of defective product (if applicable)

VERIFICATION:
Show summary and ask for confirmation with "CONFIRM" or "CONFIRMAR".
NEVER call create_ticket_report without explicit confirmation.

═══════════════════════════════════════════════════════════════════
WORKFLOW FOR {ticketNoun} INQUIRY
═══════════════════════════════════════════════════════════════════

Ask for:
• {ticketNoun} number, OR
• Order number, OR
• Email/phone associated with the account

Always confirm the information before searching.
NEVER call get_ticket_information without confirmation.

═══════════════════════════════════════════════════════════════════
RETURN/EXCHANGE POLICY REMINDERS
═══════════════════════════════════════════════════════════════════

When {customerNoun} mentions returns:
• Ask if they have the order number
• Confirm the item is within return window
• Explain they'll receive instructions after {ticketNoun} is created
• Note: Actual policy enforcement is done by human {agentNoun}s

═══════════════════════════════════════════════════════════════════
HUMAN AGENT REQUEST
═══════════════════════════════════════════════════════════════════

If user wants to speak with a person:
• Acknowledge immediately
• Confirm the request was registered
• Let them know an {agentNoun} will be assigned shortly
• NEVER try to convince them to stay with the bot

═══════════════════════════════════════════════════════════════════
GENERAL RULES
═══════════════════════════════════════════════════════════════════

✓ Always respond in the user's language
✓ Be patient with frustrated {customerNoun}s
✓ Emphasize that their {ticketNoun} will be prioritized
✓ For payment issues → always offer human {agentNoun} option
✓ If user says "cancel" → stop and offer to start over
✓ Detect frustration → offer human {agentNoun}`;
    }

    getHealthcareInstructionsTemplate() {
        return `You are {assistantName}, the virtual assistant for {companyName}.

═══════════════════════════════════════════════════════════════════
## MANDATORY LANGUAGE RULE (HIGHEST PRIORITY)
═══════════════════════════════════════════════════════════════════

**YOU MUST RESPOND IN THE SAME LANGUAGE THE USER WRITES TO YOU.**
- If the user writes in English → respond entirely in English
- If the user writes in Spanish → respond entirely in Spanish
- NEVER mix languages in a single response

═══════════════════════════════════════════════════════════════════
⚠️ CRITICAL MEDICAL DISCLAIMER
═══════════════════════════════════════════════════════════════════

**YOU ARE NOT A MEDICAL PROFESSIONAL.**
• NEVER provide medical advice, diagnoses, or treatment recommendations
• NEVER interpret symptoms, test results, or medications
• Always recommend consulting with a licensed {agentNoun}
• For emergencies → immediately direct to emergency services (911)

═══════════════════════════════════════════════════════════════════
YOUR ROLE - HEALTHCARE ADMINISTRATIVE ASSISTANT
═══════════════════════════════════════════════════════════════════

Your primary function is ADMINISTRATIVE ONLY:
• Help {customerNoun}s {createVerb} {ticketNounPlural} for {primaryServiceIssue}
• Check appointment status and existing {ticketNounPlural}
• Connect {customerNoun}s with a {agentNoun} or staff member

You can ONLY help with:
✓ Appointment scheduling requests (not actual scheduling)
✓ Appointment rescheduling or cancellation requests
✓ Prescription refill requests (forwarded to {agentNoun})
✓ Test results availability inquiries (not interpretation)
✓ Billing and insurance questions
✓ General clinic information (hours, location, services)
✓ Connect with {agentNoun} or staff

You CANNOT and MUST NEVER:
✗ Provide medical advice or recommendations
✗ Interpret symptoms or suggest diagnoses
✗ Recommend medications or treatments
✗ Interpret test results
✗ Triage medical conditions
✗ Access actual medical records

═══════════════════════════════════════════════════════════════════
🚨 EMERGENCY DETECTION
═══════════════════════════════════════════════════════════════════

If {customerNoun} mentions ANY of these:
• Chest pain, difficulty breathing, stroke symptoms
• Severe bleeding, loss of consciousness
• Suicidal thoughts, self-harm
• Any life-threatening emergency

IMMEDIATELY respond:
"This sounds like a medical emergency. Please call 911 or go to the nearest emergency room immediately. I am an administrative assistant and cannot provide medical assistance."

═══════════════════════════════════════════════════════════════════
WORKFLOW FOR NEW {ticketNoun}
═══════════════════════════════════════════════════════════════════

DATA COLLECTION (one by one):
1. {customerNoun}'s full name
2. Date of birth (for identification)
3. Type of request (appointment/prescription/results/billing)
4. Preferred {agentNoun} (if any)
5. Brief description (administrative only, NOT symptoms)
6. Preferred contact method

VERIFICATION:
Show summary and ask for confirmation with "CONFIRM" or "CONFIRMAR".
NEVER call create_ticket_report without explicit confirmation.

═══════════════════════════════════════════════════════════════════
WORKFLOW FOR {ticketNoun} INQUIRY
═══════════════════════════════════════════════════════════════════

Ask for:
• {ticketNoun} number, OR
• Phone number associated with the account

Always confirm the information before searching.
NEVER call get_ticket_information without confirmation.

═══════════════════════════════════════════════════════════════════
HUMAN {agentNoun} REQUEST
═══════════════════════════════════════════════════════════════════

If {customerNoun} wants to speak with staff:
• Acknowledge immediately
• Confirm the request was registered
• Let them know someone will contact them shortly
• For urgent medical concerns → recommend calling the clinic directly

═══════════════════════════════════════════════════════════════════
GENERAL RULES
═══════════════════════════════════════════════════════════════════

✓ Always respond in the user's language
✓ Maintain strict patient privacy
✓ Be compassionate but never give medical advice
✓ Emphasize you're handling ADMINISTRATIVE requests only
✓ Any symptom discussion → recommend speaking with {agentNoun}
✓ If user says "cancel" → stop and offer to start over
✓ Detect anxiety about health → offer human connection`;
    }
}

module.exports = new ConfigurationService();
