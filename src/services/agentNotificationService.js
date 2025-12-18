const { buildTemplateJSON } = require('../shared/whatsappModels');
const whatsappService = require('./whatsappService');
const { formatNumber } = require('../shared/processMessage');

/**
 * Determine agent's preferred language for notifications
 * @param {Object} agent - Agent object with languages array
 * @returns {string} Language code ('en_US' or 'es_MX')
 */
const getAgentLanguage = (agent) => {
    // Check if agent has languages configured
    if (agent.languages && agent.languages.length > 0) {
        const preferredLanguage = agent.languages[0];

        // Map to WhatsApp template language codes
        if (preferredLanguage === 'en') {
            return 'en_US';
        } else if (preferredLanguage === 'es') {
            return 'es_MX';
        }
    }

    // Default to Spanish (Mexico-centric project)
    return 'es_MX';
};

/**
 * Get template name based on language
 * @param {string} languageCode - Language code ('en_US' or 'es_MX')
 * @returns {string} Template name
 */
const getAssignmentTemplateName = (languageCode) => {
    return languageCode === 'en_US'
        ? 'agent_assignment_notification_en'
        : 'agent_assignment_notification_es';
};

/**
 * Send assignment notification to agent via WhatsApp template
 * @param {Object} agent - Agent object
 * @param {Object} customer - Customer object
 * @param {Object} conversation - Conversation object (optional, for priority)
 * @returns {Promise<boolean>} Success status
 */
const sendAssignmentNotification = async (agent, customer, conversation = null) => {
    try {
        // Validate agent has WhatsApp phone number
        if (!agent.phoneNumber) {
            console.warn(`⚠️ Agent ${agent.email} does not have a phone number configured. Skipping WhatsApp notification.`);
            return false;
        }

        // Format agent's phone number (ensure correct format)
        const agentPhone = formatNumber(agent.phoneNumber);

        // Determine language
        const languageCode = getAgentLanguage(agent);
        const templateName = getAssignmentTemplateName(languageCode);

        // Build template parameters
        const customerName = customer.firstName || customer.phoneNumber;
        const customerPhone = customer.phoneNumber;
        const priority = conversation?.priority || (languageCode === 'en_US' ? 'Medium' : 'Media');

        // Map priority to correct language
        const priorityText = languageCode === 'en_US'
            ? priority
            : translatePriority(priority);

        const parameters = [
            { type: 'text', text: customerName },
            { type: 'text', text: customerPhone },
            { type: 'text', text: priorityText }
        ];

        console.log(`📤 Sending assignment notification to agent ${agent.email} (${agentPhone})`);
        console.log(`   Template: ${templateName} (${languageCode})`);
        console.log(`   Customer: ${customerName} (${customerPhone})`);
        console.log(`   Priority: ${priorityText}`);

        // Build and send template message
        const templateData = buildTemplateJSON(
            agentPhone,
            templateName,
            parameters,
            languageCode
        );

        whatsappService.sendWhatsappResponse(templateData);

        console.log(`✅ Assignment notification sent to agent ${agent.email}`);
        return true;

    } catch (error) {
        console.error('❌ Error sending assignment notification to agent:', error);
        // Don't throw - notification failure shouldn't break assignment flow
        return false;
    }
};

/**
 * Translate priority to Spanish
 * @param {string} priority - Priority in English
 * @returns {string} Priority in Spanish
 */
const translatePriority = (priority) => {
    const translations = {
        'High': 'Alta',
        'Medium': 'Media',
        'Low': 'Baja',
        'high': 'Alta',
        'medium': 'Media',
        'low': 'Baja'
    };

    return translations[priority] || priority;
};

module.exports = {
    sendAssignmentNotification,
    getAgentLanguage,
    getAssignmentTemplateName
};
