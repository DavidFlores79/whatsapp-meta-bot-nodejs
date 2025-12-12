const Conversation = require('../models/Conversation');
const Message = require('../models/Message');

// Configuration
const SUGGESTION_THRESHOLDS = {
    LOW_CONFIDENCE: 0.5,  // AI confidence below this suggests takeover
    NEGATIVE_SENTIMENT_COUNT: 2,  // Negative messages in a row
    REPEATED_QUESTION_COUNT: 3,  // Same question asked multiple times
    LONG_CONVERSATION: 15,  // Message count threshold
    ESCALATION_KEYWORDS: [
        // Spanish - explicit requests
        'hablar con persona', 'hablar con humano', 'hablar con alguien',
        'agente real', 'agente humano', 'persona real',
        'gerente', 'supervisor', 'encargado', 'responsable',
        'quiero hablar', 'necesito hablar', 'comunicar con',
        'atención humana', 'ayuda humana', 'asistencia humana',
        'contactar con', 'hablar directamente',
        
        // Spanish - dissatisfaction/urgency
        'mal servicio', 'pésimo servicio', 'cancelar', 'denunciar',
        'queja', 'reclamo', 'no funciona', 'no sirve',
        'urgente', 'emergencia', 'inmediato',
        'frustrado', 'molesto', 'enojado',
        'ya basta', 'harto', 'cansado',
        
        // Spanish - AI not understanding
        'no me entiendes', 'no entiendes', 'no comprendes',
        'no ayudas', 'no sirves', 'no resuelves',
        'no contestas', 'no respondes bien',
        
        // English equivalents
        'speak to person', 'talk to human', 'talk to someone',
        'real agent', 'human agent', 'real person',
        'manager', 'supervisor',
        'i want to speak', 'i need to speak', 'speak directly',
        'human help', 'human assistance',
        'bad service', 'cancel', 'complaint',
        'not working', 'doesn\'t work', 'urgent', 'emergency',
        'don\'t understand', 'not helpful', 'frustrated',
        
        // Common variations
        'eres bot', 'eres robot', 'you\'re a bot',
        'no eres real', 'you\'re not real',
        'prefiero humano', 'prefer human',
        'mejor persona', 'better person'
    ]
};

/**
 * Use AI to intelligently detect customer request for human help
 */
async function detectHumanHelpRequest(messageContent, recentMessages = []) {
    try {
        const openaiService = require('./openaiService');
        
        // Build context from recent messages
        const context = recentMessages.slice(0, 5).map(msg => 
            `${msg.sender === 'customer' ? 'Customer' : 'AI'}: ${msg.content}`
        ).join('\n');

        const prompt = `Analyze if the customer is requesting to speak with a human agent or expressing frustration with AI assistance.

Recent conversation:
${context}

Latest message: "${messageContent}"

Consider these indicators:
- Explicit requests for human/person/agent/supervisor
- Expressing frustration with AI ("you don't understand", "not helpful")
- Indicating AI is not solving their problem
- Urgency or emergency language
- Complaints about service
- Saying they prefer human assistance
- Any creative way of asking for human help

Respond with ONLY a JSON object:
{
  "wants_human": true/false,
  "confidence": 0-100,
  "reason": "brief explanation",
  "urgency": "low/medium/high"
}`;

        const response = await openaiService.getChatCompletion(
            [{ role: "user", content: prompt }],
            {
                model: "gpt-4o-mini",
                temperature: 0.3,
                max_tokens: 150,
                response_format: { type: "json_object" }
            }
        );

        const analysis = JSON.parse(response);
        console.log(`🤖 AI Analysis for human help request:`, analysis);
        
        return analysis;
    } catch (error) {
        console.error("❌ Error in AI detection:", error.message);
        // Fallback to keyword detection
        return {
            wants_human: false,
            confidence: 0,
            reason: "AI detection failed, using fallback",
            urgency: "low"
        };
    }
}

/**
 * Analyze message for takeover triggers
 */
async function analyzeForTakeover(conversationId, messageContent, aiResponse = null) {
    const { io } = require('../models/server');

    const conversation = await Conversation.findById(conversationId).populate('customerId');

    if (!conversation || !conversation.isAIEnabled || conversation.assignedAgent) {
        return null; // Already assigned or AI disabled
    }

    const triggers = [];
    let suggestionScore = 0;

    // Get recent messages for context
    const recentMessages = await Message.find({
        conversationId,
        sender: { $in: ['customer', 'ai'] }
    })
        .sort({ timestamp: -1 })
        .limit(10);

    // 1. AI-POWERED DETECTION (Primary method)
    const aiDetection = await detectHumanHelpRequest(messageContent, recentMessages);
    
    if (aiDetection.wants_human && aiDetection.confidence >= 60) {
        triggers.push(`ai_detected_request (${aiDetection.confidence}% confidence)`);
        suggestionScore += Math.min(aiDetection.confidence, 70);
        
        console.log(`🤖 AI detected human help request: ${aiDetection.reason}`);
        console.log(`   Urgency: ${aiDetection.urgency}, Confidence: ${aiDetection.confidence}%`);
    }

    // 2. KEYWORD FALLBACK (Secondary method)
    const hasEscalationKeyword = SUGGESTION_THRESHOLDS.ESCALATION_KEYWORDS.some(keyword =>
        messageContent.toLowerCase().includes(keyword)
    );
    
    if (hasEscalationKeyword) {
        triggers.push('escalation_keyword');
        suggestionScore += 40;
    }

    // 3. Check AI uncertainty in response
    if (aiResponse && (
        aiResponse.toLowerCase().includes('no puedo') ||
        aiResponse.toLowerCase().includes('no estoy seguro') ||
        aiResponse.toLowerCase().includes('necesitas hablar con') ||
        aiResponse.toLowerCase().includes('te recomiendo hablar') ||
        aiResponse.toLowerCase().includes('i cannot') ||
        aiResponse.toLowerCase().includes('i\'m not sure')
    )) {
        triggers.push('ai_uncertainty');
        suggestionScore += 30;
    }

    // 4. Check message count (long conversations)
    if (conversation.messageCount >= SUGGESTION_THRESHOLDS.LONG_CONVERSATION) {
        triggers.push('long_conversation');
        suggestionScore += 20;
    }

    // 5. Check for negative sentiment in recent messages
    const negativeCount = recentMessages.filter(msg =>
        msg.aiResponse?.sentiment === 'negative'
    ).length;

    if (negativeCount >= SUGGESTION_THRESHOLDS.NEGATIVE_SENTIMENT_COUNT) {
        triggers.push('negative_sentiment');
        suggestionScore += 25;
    }

    // 6. Check for repeated questions (customer asking same thing)
    const repeatedPattern = checkRepeatedQuestions(recentMessages);
    if (repeatedPattern) {
        triggers.push('repeated_questions');
        suggestionScore += 35;
    }

    // AUTO-ASSIGN if high confidence human help request
    if (suggestionScore >= 60 && (aiDetection.wants_human || hasEscalationKeyword)) {
        console.log(`🚨 High confidence human help request (score: ${suggestionScore}) - Auto-assigning conversation ${conversationId}`);

        // Send friendly AI response before assigning
        const whatsappService = require('./whatsappService');
        const { buildTextJSON } = require('../shared/whatsappModels');
        const phoneNumber = conversation.customerId.phoneNumber;

        const urgencyMessage = aiDetection.urgency === 'high' 
            ? '¡Entiendo que es urgente! ' 
            : '';

        const assignmentMessage = buildTextJSON(
            phoneNumber,
            `${urgencyMessage}¡Por supuesto! En unos momentos un agente de nuestro equipo será asignado a esta conversación para ayudarte. Gracias por tu paciencia. 😊`
        );

        await whatsappService.sendWhatsappResponse(assignmentMessage);
        console.log(`📤 Sent assignment notification to customer`);

        const agentAssignmentService = require('./agentAssignmentService');
        const assignment = await agentAssignmentService.autoAssignConversation(conversationId);

        if (assignment) {
            console.log(`✅ Conversation ${conversationId} auto-assigned to agent ${assignment.agent.email}`);
            return { 
                ...assignment, 
                autoAssigned: true, 
                trigger: 'customer_request',
                aiAnalysis: aiDetection
            };
        } else {
            console.log(`⚠️ No available agents for auto-assignment - creating suggestion`);

            // Send fallback message if no agents available
            const fallbackMessage = buildTextJSON(
                phoneNumber,
                'Lamento informarte que no hay agentes disponibles en este momento. Por favor, inténtalo más tarde o deja tu mensaje y te responderemos lo antes posible.'
            );
            await whatsappService.sendWhatsappResponse(fallbackMessage);
        }
    }

    // Create suggestion if score is moderate (30-59)
    if (suggestionScore >= 30 && suggestionScore < 60 && triggers.length > 0) {
        return await createTakeoverSuggestion(conversation, triggers, suggestionScore, aiDetection);
    }

    return null;
}

/**
 * Check for repeated questions
 */
function checkRepeatedQuestions(messages) {
    if (messages.length < 3) return false;

    const questionWords = messages.map(msg =>
        msg.content.toLowerCase().split(' ').filter(w => w.length > 4)
    );

    // Simple similarity check
    for (let i = 0; i < questionWords.length - 1; i++) {
        for (let j = i + 1; j < questionWords.length; j++) {
            const similarity = calculateSimilarity(questionWords[i], questionWords[j]);
            if (similarity > 0.6) {
                return true;
            }
        }
    }

    return false;
}

/**
 * Calculate word similarity (simple Jaccard similarity)
 */
function calculateSimilarity(words1, words2) {
    const set1 = new Set(words1);
    const set2 = new Set(words2);
    const intersection = new Set([...set1].filter(x => set2.has(x)));
    const union = new Set([...set1, ...set2]);
    return intersection.size / union.size;
}

/**
 * Create and emit takeover suggestion
 */
async function createTakeoverSuggestion(conversation, triggers, score, aiAnalysis = null) {
    const { io } = require('../models/server');

    const suggestion = {
        conversationId: conversation._id,
        customerId: conversation.customerId?._id,
        triggers,
        score,
        timestamp: new Date(),
        status: 'pending',
        aiAnalysis: aiAnalysis ? {
            reason: aiAnalysis.reason,
            confidence: aiAnalysis.confidence,
            urgency: aiAnalysis.urgency
        } : null
    };

    // Store suggestion in conversation
    if (!conversation.internalNotes) {
        conversation.internalNotes = [];
    }
    
    const noteContent = aiAnalysis 
        ? `Auto-takeover suggested: ${triggers.join(', ')} (Score: ${score}) | AI: ${aiAnalysis.reason}`
        : `Auto-takeover suggested: ${triggers.join(', ')} (Score: ${score})`;
    
    conversation.internalNotes.push({
        content: noteContent,
        timestamp: new Date(),
        isVisible: false
    });
    await conversation.save();

    // Emit to all available agents
    io.emit('takeover_suggested', {
        ...suggestion,
        customerName: conversation.customerId?.firstName || 'Unknown',
        customerPhone: conversation.customerId?.phoneNumber,
        lastMessage: conversation.lastMessage
    });

    console.log(`🔔 Takeover suggested for conversation ${conversation._id}`);
    console.log(`   Triggers: ${triggers.join(', ')}`);
    console.log(`   Score: ${score}`);
    if (aiAnalysis) {
        console.log(`   AI Analysis: ${aiAnalysis.reason} (${aiAnalysis.confidence}% confidence)`);
    }

    return suggestion;
}

module.exports = {
    analyzeForTakeover,
    SUGGESTION_THRESHOLDS
};
