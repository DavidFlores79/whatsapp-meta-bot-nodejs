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
     */
    async analyzeAgentInteraction(conversationId, agentId, contextSummary) {
        try {
            console.log(`🤖 Analyzing agent interaction for conversation ${conversationId}`);

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

            // Build analysis prompt
            const analysisPrompt = this._buildAnalysisPrompt(
                messagesBeforeAgent,
                agentMessages,
                customerMessages,
                contextSummary
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
     */
    _buildAnalysisPrompt(preAgentMessages, agentMessages, customerMessages, context) {
        const preAgentContext = preAgentMessages.slice(-10).map(m => 
            `[${m.sender.toUpperCase()}] ${m.content}`
        ).join('\n');

        const agentInteraction = this._interleaveMessages(agentMessages, customerMessages);

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
                model: 'gpt-4o',
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
     */
    async generateConversationSummary(conversationId, includeLastMessages = 10) {
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

            // Build quick summary prompt
            const summaryPrompt = `Summarize this customer conversation for an agent who is taking over. Be concise but informative.

CONVERSATION:
${messages.map(m => `[${m.sender.toUpperCase()}] ${m.content}`).join('\n')}

Provide a JSON response:
{
    "briefSummary": "2-3 sentence overview for quick reading",
    "customerIntent": "What the customer wants/needs",
    "currentStatus": "Where the conversation stands now",
    "keyPoints": ["3-5 most important points the agent should know"],
    "suggestedApproach": "How the agent should handle this",
    "urgency": "low|medium|high|urgent",
    "sentiment": "frustrated|concerned|neutral|satisfied",
    "estimatedCategory": "support|sales|billing|technical|complaint|other"
}`;

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
                briefSummary: 'Unable to generate summary',
                customerIntent: 'Unknown',
                currentStatus: 'Needs agent review',
                keyPoints: ['Review conversation history'],
                suggestedApproach: 'Greet customer and assess situation',
                urgency: 'medium',
                sentiment: 'neutral',
                estimatedCategory: 'support',
                error: error.message
            };
        }
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
