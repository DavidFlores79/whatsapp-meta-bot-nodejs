const openaiService = require('./openaiService');
const Message = require('../models/Message');
const Conversation = require('../models/Conversation');

/**
 * Analyzes agent-customer interaction using AI
 * Evaluates performance, resolution, sentiment, and provides recommendations
 */
class ConversationAnalysisService {
    /**
     * Generate comprehensive analysis of agent's interaction
     * @param {string} conversationId - ID of the conversation
     * @param {string} agentId - ID of the agent
     * @param {Object} contextSummary - Context summary object
     * @param {string} language - Language preference ('es-MX' or 'en-US'), defaults to 'es-MX'
     */
    async analyzeAgentInteraction(conversationId, agentId, contextSummary, language = 'es-MX') {
        try {
            console.log(`🤖 Analyzing agent interaction for conversation ${conversationId} in ${language}`);

            // Get all messages from when agent took over
            const messages = await Message.find({
                conversationId,
                timestamp: { $gte: contextSummary.conversationStartedAt || new Date(Date.now() - 24 * 60 * 60 * 1000) }
            })
            .populate('agentId', 'firstName lastName')
            .sort({ timestamp: 1 })
            .lean();

            // Separate messages by phase
            const messagesBeforeAgent = messages.filter(m => 
                m.timestamp < contextSummary.assignmentTime && m.sender !== 'agent'
            );
            
            const agentMessages = messages.filter(m => 
                m.timestamp >= contextSummary.assignmentTime && m.sender === 'agent'
            );
            
            const customerMessages = messages.filter(m => 
                m.timestamp >= contextSummary.assignmentTime && m.sender === 'customer'
            );

            // Build language-specific analysis prompt
            const analysisPrompt = this._buildAnalysisPrompt(
                messagesBeforeAgent,
                agentMessages,
                customerMessages,
                contextSummary,
                language
            );

            // Get AI analysis
            const analysis = await this._getAIAnalysis(analysisPrompt);

            return {
                ...analysis,
                metadata: {
                    totalMessages: messages.length,
                    agentMessages: agentMessages.length,
                    customerMessages: customerMessages.length,
                    interactionDuration: contextSummary.duration,
                    analyzedAt: new Date()
                }
            };

        } catch (error) {
            console.error('❌ Error analyzing agent interaction:', error);
            return this._getDefaultAnalysis(error.message);
        }
    }

    /**
     * Build detailed prompt for AI analysis
     * @param {Array} preAgentMessages - Messages before agent took over
     * @param {Array} agentMessages - Messages from agent
     * @param {Array} customerMessages - Messages from customer
     * @param {Object} context - Context summary object
     * @param {string} language - Language code ('es-MX' or 'en-US')
     * @returns {string} Formatted analysis prompt in the specified language
     */
    _buildAnalysisPrompt(preAgentMessages, agentMessages, customerMessages, context, language = 'es-MX') {
        const preAgentContext = preAgentMessages.slice(-10).map(m => 
            `[${m.sender.toUpperCase()}] ${m.content}`
        ).join('\n');

        const agentInteraction = this._interleaveMessages(agentMessages, customerMessages);

        if (language === 'en-US') {
            return `You are an expert customer service analyst. Analyze this customer support interaction and provide a comprehensive evaluation.

CONTEXT BEFORE AGENT TOOK OVER:
${preAgentContext || 'No previous messages (agent took over immediately)'}

AGENT-CUSTOMER INTERACTION:
${agentInteraction}

CONVERSATION METADATA:
- Category: ${context.category || 'Not specified'}
- Priority: ${context.priority || 'medium'}
- Duration: ${context.duration ? `${Math.floor(context.duration / 60)} minutes` : 'Unknown'}
- Tags: ${context.tags?.join(', ') || 'None'}

Analyze this interaction and provide a JSON response with the following structure:
{
    "issueResolution": {
        "wasResolved": boolean,
        "resolutionQuality": "excellent|good|partial|poor|unresolved",
        "explanation": "Brief explanation of resolution status",
        "issueType": "technical|billing|general_inquiry|complaint|other",
        "rootCause": "What was the actual problem"
    },
    "agentPerformance": {
        "overallScore": number (1-10),
        "professionalism": number (1-10),
        "responsiveness": number (1-10),
        "knowledgeability": number (1-10),
        "empathy": number (1-10),
        "problemSolving": number (1-10),
        "strengths": ["list of what agent did well"],
        "areasForImprovement": ["list of areas to improve"],
        "criticalIssues": ["serious problems if any, empty if none"]
    },
    "customerSentiment": {
        "initial": "frustrated|concerned|neutral|satisfied",
        "final": "angry|frustrated|neutral|satisfied|happy",
        "sentimentChange": "improved|worsened|unchanged",
        "likelyToRecommend": boolean,
        "explanation": "Brief explanation of sentiment analysis"
    },
    "conversationQuality": {
        "clarityScore": number (1-10),
        "efficiencyScore": number (1-10),
        "completenessScore": number (1-10),
        "overallQuality": "excellent|good|fair|poor"
    },
    "actionItems": {
        "followUpRequired": boolean,
        "followUpTasks": ["list of specific follow-up actions needed"],
        "escalationNeeded": boolean,
        "escalationReason": "reason if escalation needed, null otherwise"
    },
    "recommendations": {
        "forAgent": ["specific recommendations for this agent"],
        "forSystem": ["process improvements or system changes suggested"],
        "forTraining": ["training topics this case highlights"]
    },
    "summary": {
        "brief": "2-3 sentence summary for dashboards",
        "detailed": "Comprehensive paragraph summarizing the entire interaction",
        "keyPoints": ["3-5 most important takeaways"]
    },
    "tags": ["auto-generated tags based on conversation analysis"],
    "riskLevel": "none|low|medium|high|critical"
}

Be objective, fair, and constructive in your analysis. Focus on actionable insights.`;
        }

        // Default: Spanish (es-MX)
        return `Eres un analista experto en servicio al cliente. Analiza esta interacción de soporte al cliente y proporciona una evaluación integral.

CONTEXTO ANTES DE QUE EL AGENTE TOMARA EL CONTROL:
${preAgentContext || 'No hay mensajes previos (el agente tomó el control inmediatamente)'}

INTERACCIÓN AGENTE-CLIENTE:
${agentInteraction}

METADATOS DE LA CONVERSACIÓN:
- Categoría: ${context.category || 'No especificada'}
- Prioridad: ${context.priority || 'media'}
- Duración: ${context.duration ? `${Math.floor(context.duration / 60)} minutos` : 'Desconocida'}
- Etiquetas: ${context.tags?.join(', ') || 'Ninguna'}

Analiza esta interacción y proporciona una respuesta en formato JSON con la siguiente estructura:
{
    "issueResolution": {
        "wasResolved": boolean,
        "resolutionQuality": "excellent|good|partial|poor|unresolved",
        "explanation": "Breve explicación del estado de resolución",
        "issueType": "technical|billing|general_inquiry|complaint|other",
        "rootCause": "Cuál fue el problema real"
    },
    "agentPerformance": {
        "overallScore": number (1-10),
        "professionalism": number (1-10),
        "responsiveness": number (1-10),
        "knowledgeability": number (1-10),
        "empathy": number (1-10),
        "problemSolving": number (1-10),
        "strengths": ["lista de lo que el agente hizo bien"],
        "areasForImprovement": ["lista de áreas a mejorar"],
        "criticalIssues": ["problemas graves si hay alguno, vacío si no"]
    },
    "customerSentiment": {
        "initial": "frustrated|concerned|neutral|satisfied",
        "final": "angry|frustrated|neutral|satisfied|happy",
        "sentimentChange": "improved|worsened|unchanged",
        "likelyToRecommend": boolean,
        "explanation": "Breve explicación del análisis de sentimiento"
    },
    "conversationQuality": {
        "clarityScore": number (1-10),
        "efficiencyScore": number (1-10),
        "completenessScore": number (1-10),
        "overallQuality": "excellent|good|fair|poor"
    },
    "actionItems": {
        "followUpRequired": boolean,
        "followUpTasks": ["lista de acciones de seguimiento específicas necesarias"],
        "escalationNeeded": boolean,
        "escalationReason": "razón si se necesita escalamiento, null de lo contrario"
    },
    "recommendations": {
        "forAgent": ["recomendaciones específicas para este agente"],
        "forSystem": ["mejoras de proceso o cambios del sistema sugeridos"],
        "forTraining": ["temas de capacitación que este caso destaca"]
    },
    "summary": {
        "brief": "Resumen de 2-3 oraciones para paneles",
        "detailed": "Párrafo completo que resume toda la interacción",
        "keyPoints": ["3-5 conclusiones más importantes"]
    },
    "tags": ["etiquetas generadas automáticamente basadas en el análisis de conversación"],
    "riskLevel": "none|low|medium|high|critical"
}

Sé objetivo, justo y constructivo en tu análisis. Enfócate en ideas procesables.`;
    }

    /**
     * Interleave agent and customer messages chronologically
     */
    _interleaveMessages(agentMessages, customerMessages) {
        const all = [...agentMessages, ...customerMessages]
            .sort((a, b) => a.timestamp - b.timestamp);

        return all.map(m => {
            const sender = m.sender === 'agent' ? 
                `AGENT${m.agentId ? ` (${m.agentId.firstName})` : ''}` : 
                'CUSTOMER';
            return `[${sender}] ${m.content}`;
        }).join('\n') || 'No messages exchanged';
    }

    /**
     * Get AI analysis using OpenAI
     */
    async _getAIAnalysis(prompt) {
        try {
            const response = await openaiService.getChatCompletion([
                {
                    role: 'system',
                    content: 'You are an expert customer service quality analyst. Provide detailed, objective analysis in valid JSON format.'
                },
                {
                    role: 'user',
                    content: prompt
                }
            ], {
                model: 'gpt-4o-mini',
                temperature: 0.3,
                response_format: { type: "json_object" }
            });

            return JSON.parse(response);

        } catch (error) {
            console.error('❌ Error getting AI analysis:', error);
            throw error;
        }
    }

    /**
     * Generate quick summary when agent takes over (for context)
     * @param {string} conversationId - ID of the conversation
     * @param {number} includeLastMessages - Number of recent messages to include
     * @param {string} language - Language preference ('es-MX' or 'en-US'), defaults to 'es-MX'
     */
    async generateConversationSummary(conversationId, includeLastMessages = 10, language = 'es-MX') {
        try {
            const conversation = await Conversation.findById(conversationId);
            if (!conversation) {
                throw new Error('Conversation not found');
            }

            // Get recent messages
            const messages = await Message.find({ conversationId })
                .sort({ timestamp: -1 })
                .limit(includeLastMessages)
                .lean();

            messages.reverse(); // Oldest first

            const aiMessages = messages.filter(m => m.sender === 'ai');
            const customerMessages = messages.filter(m => m.sender === 'customer');

            // Build language-specific summary prompt
            const summaryPrompt = this._buildSummaryPrompt(messages, language);

            const summary = await this._getAIAnalysis(summaryPrompt);

            return {
                ...summary,
                metadata: {
                    totalMessages: messages.length,
                    aiMessagesCount: aiMessages.length,
                    customerMessagesCount: customerMessages.length,
                    conversationAge: conversation.createdAt ? 
                        Math.floor((Date.now() - conversation.createdAt) / 60000) : 0, // minutes
                    lastMessages: messages.slice(-5).map(m => ({
                        content: m.content,
                        sender: m.sender,
                        timestamp: m.timestamp,
                        type: m.type
                    }))
                }
            };

        } catch (error) {
            console.error('❌ Error generating conversation summary:', error);
            return {
                briefSummary: 'No se pudo generar el resumen',
                customerIntent: 'Desconocido',
                currentStatus: 'Requiere revisión del agente',
                keyPoints: ['Revisar historial de conversación'],
                suggestedApproach: 'Saludar al cliente y evaluar la situación',
                urgency: 'medium',
                sentiment: 'neutral',
                estimatedCategory: 'support',
                error: error.message
            };
        }
    }

    /**
     * Build language-specific summary prompt for AI analysis
     * @param {Array} messages - Array of message objects
     * @param {string} language - Language code ('es-MX' or 'en-US')
     * @returns {string} Formatted prompt in the specified language
     */
    _buildSummaryPrompt(messages, language = 'es-MX') {
        const formattedMessages = messages.map(m => 
            `[${m.sender.toUpperCase()}] ${m.content}`
        ).join('\n');

        if (language === 'en-US') {
            return `You are a customer service context analyst. Analyze this conversation between a customer and an AI assistant to provide a quick summary for a human agent who is about to take over.

CONVERSATION HISTORY:
${formattedMessages}

Provide a JSON response with the following structure:
{
    "briefSummary": "2-3 sentence summary of what has happened",
    "customerIntent": "What the customer is trying to accomplish",
    "currentStatus": "Current state of the conversation (resolved, in-progress, stuck, needs-escalation)",
    "keyPoints": ["3-5 most important points from the conversation"],
    "suggestedApproach": "Recommended way for the agent to continue this conversation",
    "urgency": "low|medium|high|critical",
    "sentiment": "frustrated|concerned|neutral|satisfied|happy",
    "estimatedCategory": "billing|technical|general_inquiry|complaint|other",
    "previousActions": ["What has been tried or discussed so far"],
    "outstandingQuestions": ["Questions or issues that remain unresolved"]
}

Be concise and actionable. Focus on what the agent needs to know right now.`;
        }

        // Default: Spanish (es-MX)
        return `Eres un analista de contexto de servicio al cliente. Analiza esta conversación entre un cliente y un asistente de IA para proporcionar un resumen rápido a un agente humano que está por tomar el control.

HISTORIAL DE CONVERSACIÓN:
${formattedMessages}

Proporciona una respuesta en formato JSON con la siguiente estructura:
{
    "briefSummary": "Resumen de 2-3 oraciones de lo que ha sucedido",
    "customerIntent": "Lo que el cliente está tratando de lograr",
    "currentStatus": "Estado actual de la conversación (resolved, in-progress, stuck, needs-escalation)",
    "keyPoints": ["3-5 puntos más importantes de la conversación"],
    "suggestedApproach": "Forma recomendada para que el agente continúe esta conversación",
    "urgency": "low|medium|high|critical",
    "sentiment": "frustrated|concerned|neutral|satisfied|happy",
    "estimatedCategory": "billing|technical|general_inquiry|complaint|other",
    "previousActions": ["Lo que se ha intentado o discutido hasta ahora"],
    "outstandingQuestions": ["Preguntas o problemas que siguen sin resolverse"]
}

Sé conciso y enfocado en acciones. Concéntrate en lo que el agente necesita saber ahora mismo.`;
    }

    /**
     * Analyze customer sentiment from recent messages
     */
    async analyzeCustomerSentiment(messages) {
        const customerMessages = messages
            .filter(m => m.sender === 'customer')
            .slice(-5)
            .map(m => m.content)
            .join(' ');

        if (!customerMessages) {
            return { sentiment: 'neutral', confidence: 'low' };
        }

        const prompt = `Analyze the customer sentiment from these messages: "${customerMessages}"
        
Return JSON: {"sentiment": "frustrated|concerned|neutral|satisfied|happy", "confidence": "low|medium|high", "indicators": ["key words/phrases"]}`;

        try {
            const result = await this._getAIAnalysis(prompt);
            return result;
        } catch (error) {
            return { sentiment: 'neutral', confidence: 'low', error: error.message };
        }
    }

    /**
     * Default analysis when AI analysis fails
     */
    _getDefaultAnalysis(errorMessage) {
        return {
            issueResolution: {
                wasResolved: null,
                resolutionQuality: 'unknown',
                explanation: 'Analysis could not be completed',
                issueType: 'other',
                rootCause: 'Unknown'
            },
            agentPerformance: {
                overallScore: null,
                professionalism: null,
                responsiveness: null,
                knowledgeability: null,
                empathy: null,
                problemSolving: null,
                strengths: [],
                areasForImprovement: ['Unable to analyze'],
                criticalIssues: []
            },
            customerSentiment: {
                initial: 'neutral',
                final: 'neutral',
                sentimentChange: 'unchanged',
                likelyToRecommend: null,
                explanation: 'Sentiment analysis unavailable'
            },
            conversationQuality: {
                clarityScore: null,
                efficiencyScore: null,
                completenessScore: null,
                overallQuality: 'unknown'
            },
            actionItems: {
                followUpRequired: false,
                followUpTasks: [],
                escalationNeeded: false,
                escalationReason: null
            },
            recommendations: {
                forAgent: [],
                forSystem: [],
                forTraining: []
            },
            summary: {
                brief: 'Analysis incomplete',
                detailed: `AI analysis failed: ${errorMessage}`,
                keyPoints: ['Manual review recommended']
            },
            tags: ['analysis-failed'],
            riskLevel: 'none',
            error: errorMessage
        };
    }
}

module.exports = new ConversationAnalysisService();
