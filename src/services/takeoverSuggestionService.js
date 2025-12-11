const Conversation = require('../models/Conversation');
const Message = require('../models/Message');

// Configuration
const SUGGESTION_THRESHOLDS = {
    LOW_CONFIDENCE: 0.5,  // AI confidence below this suggests takeover
    NEGATIVE_SENTIMENT_COUNT: 2,  // Negative messages in a row
    REPEATED_QUESTION_COUNT: 3,  // Same question asked multiple times
    LONG_CONVERSATION: 15,  // Message count threshold
    ESCALATION_KEYWORDS: [
        'hablar con persona',
        'hablar con humano',
        'hablar con alguien',
        'agente real',
        'agente humano',
        'persona real',
        'gerente',
        'supervisor',
        'mal servicio',
        'cancelar',
        'denunciar',
        'queja',
        'no funciona',
        'no sirve',
        'ayuda humana',
        'quiero hablar',
        'necesito hablar',
        'comunicar con'
    ]
};

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

    // 1. Check for escalation keywords
    const hasEscalationKeyword = SUGGESTION_THRESHOLDS.ESCALATION_KEYWORDS.some(keyword =>
        messageContent.toLowerCase().includes(keyword)
    );
    if (hasEscalationKeyword) {
        triggers.push('escalation_keyword');
        suggestionScore += 50;

        // AUTO-ASSIGN: Customer explicitly requested human help
        console.log(`🚨 Customer requested human help - Auto-assigning conversation ${conversationId}`);

        // Send friendly AI response before assigning
        const whatsappService = require('./whatsappService');
        const { buildTextJSON } = require('../shared/processMessage');
        const phoneNumber = conversation.customerId.phoneNumber;

        const assignmentMessage = buildTextJSON(
            phoneNumber,
            '¡Por supuesto! En unos momentos un agente de nuestro equipo será asignado a esta conversación para ayudarte. Gracias por tu paciencia. 😊'
        );

        await whatsappService.sendWhatsappResponse(assignmentMessage);
        console.log(`📤 Sent assignment notification to customer`);

        const agentAssignmentService = require('./agentAssignmentService');
        const assignment = await agentAssignmentService.autoAssignConversation(conversationId);

        if (assignment) {
            console.log(`✅ Conversation ${conversationId} auto-assigned to agent ${assignment.agent.email}`);
            return { ...assignment, autoAssigned: true, trigger: 'customer_request' };
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

    // 2. Check AI confidence (if provided in aiResponse metadata)
    if (aiResponse && (
        aiResponse.toLowerCase().includes('no puedo') ||
        aiResponse.toLowerCase().includes('no estoy seguro') ||
        aiResponse.toLowerCase().includes('necesitas hablar con')
    )) {
        triggers.push('ai_uncertainty');
        suggestionScore += 30;
    }

    // 3. Check message count (long conversations)
    if (conversation.messageCount >= SUGGESTION_THRESHOLDS.LONG_CONVERSATION) {
        triggers.push('long_conversation');
        suggestionScore += 20;
    }

    // 4. Check for negative sentiment in recent messages
    const recentMessages = await Message.find({
        conversationId,
        sender: 'customer'
    })
        .sort({ timestamp: -1 })
        .limit(5);

    const negativeCount = recentMessages.filter(msg =>
        msg.aiResponse?.sentiment === 'negative'
    ).length;

    if (negativeCount >= SUGGESTION_THRESHOLDS.NEGATIVE_SENTIMENT_COUNT) {
        triggers.push('negative_sentiment');
        suggestionScore += 25;
    }

    // 5. Check for repeated questions (customer asking same thing)
    const repeatedPattern = checkRepeatedQuestions(recentMessages);
    if (repeatedPattern) {
        triggers.push('repeated_questions');
        suggestionScore += 35;
    }

    // Determine if suggestion should be sent
    if (suggestionScore >= 50 && triggers.length > 0) {
        return await createTakeoverSuggestion(conversation, triggers, suggestionScore);
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
async function createTakeoverSuggestion(conversation, triggers, score) {
    const { io } = require('../models/server');

    const suggestion = {
        conversationId: conversation._id,
        customerId: conversation.customerId?._id,
        triggers,
        score,
        timestamp: new Date(),
        status: 'pending'
    };

    // Store suggestion in conversation
    if (!conversation.internalNotes) {
        conversation.internalNotes = [];
    }
    conversation.internalNotes.push({
        content: `Auto-takeover suggested: ${triggers.join(', ')} (Score: ${score})`,
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

    console.log(`🔔 Takeover suggested for conversation ${conversation._id} - Triggers: ${triggers.join(', ')}`);

    return suggestion;
}

module.exports = {
    analyzeForTakeover,
    SUGGESTION_THRESHOLDS
};
