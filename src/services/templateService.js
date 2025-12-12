const https = require('https');
const Template = require('../models/Template');

const URI = process.env.WHATSAPP_URI;
const VERSION = process.env.WHATSAPP_VERSION;
const TOKEN = process.env.WHATSAPP_API_TOKEN;
const WABA_ID = process.env.WHATSAPP_BUSINESS_ACCOUNT_ID;

/**
 * Fetch all templates from WhatsApp Business API
 * @returns {Promise<Array>} - Array of templates
 */
const fetchTemplatesFromMeta = async () => {
    return new Promise((resolve, reject) => {
        const options = {
            host: URI,
            path: `/${VERSION}/${WABA_ID}/message_templates?fields=name,status,category,language,components,id,rejected_reason`,
            method: 'GET',
            headers: {
                'Authorization': `Bearer ${TOKEN}`,
            }
        };

        console.log('Fetching templates from Meta WhatsApp API...');

        const req = https.request(options, res => {
            let data = '';

            res.on('data', chunk => {
                data += chunk;
            });

            res.on('end', () => {
                try {
                    const response = JSON.parse(data);
                    if (response.data) {
                        console.log(`Fetched ${response.data.length} templates from Meta`);
                        resolve(response.data);
                    } else {
                        console.error('No templates data in response:', response);
                        reject(new Error(response.error?.message || 'No templates data in response'));
                    }
                } catch (error) {
                    console.error('Error parsing templates response:', error);
                    reject(error);
                }
            });
        });

        req.on('error', error => {
            console.error('Error fetching templates from Meta:', error);
            reject(error);
        });

        req.end();
    });
};

/**
 * Sync templates from Meta API to local database
 * @returns {Promise<Object>} - Sync statistics
 */
const syncTemplatesFromMeta = async () => {
    try {
        const metaTemplates = await fetchTemplatesFromMeta();

        const stats = {
            total: metaTemplates.length,
            created: 0,
            updated: 0,
            failed: 0,
            errors: []
        };

        for (const metaTemplate of metaTemplates) {
            try {
                const templateData = {
                    name: metaTemplate.name,
                    status: metaTemplate.status,
                    category: metaTemplate.category,
                    language: metaTemplate.language,
                    components: metaTemplate.components || [],
                    whatsappTemplateId: metaTemplate.id,
                    rejectionReason: metaTemplate.rejected_reason,
                    lastSyncedAt: new Date()
                };

                // Extract parameters from components
                const parameters = [];
                if (metaTemplate.components) {
                    metaTemplate.components.forEach((component, index) => {
                        if (component.type === 'BODY' && component.text) {
                            const paramMatches = component.text.match(/\{\{(\d+)\}\}/g);
                            if (paramMatches) {
                                paramMatches.forEach((match, pos) => {
                                    parameters.push({
                                        name: `param${pos + 1}`,
                                        type: 'text',
                                        position: pos + 1,
                                        component: 'BODY'
                                    });
                                });
                            }
                        }
                        if (component.type === 'HEADER' && component.format !== 'TEXT' && component.format) {
                            parameters.push({
                                name: 'header',
                                type: component.format.toLowerCase(),
                                position: 0,
                                component: 'HEADER'
                            });
                        }
                    });
                }
                templateData.parameters = parameters;

                // Update or create template
                const existingTemplate = await Template.findOne({
                    $or: [
                        { whatsappTemplateId: metaTemplate.id },
                        { name: metaTemplate.name }
                    ]
                });

                if (existingTemplate) {
                    await Template.updateOne(
                        { _id: existingTemplate._id },
                        { $set: templateData }
                    );
                    stats.updated++;
                    console.log(`Updated template: ${metaTemplate.name}`);
                } else {
                    await Template.create(templateData);
                    stats.created++;
                    console.log(`Created template: ${metaTemplate.name}`);
                }
            } catch (error) {
                console.error(`Error syncing template ${metaTemplate.name}:`, error);
                stats.failed++;
                stats.errors.push({
                    template: metaTemplate.name,
                    error: error.message
                });
            }
        }

        console.log('Template sync completed:', stats);
        return stats;
    } catch (error) {
        console.error('Error in syncTemplatesFromMeta:', error);
        throw error;
    }
};

/**
 * Get all templates from local database
 * @param {Object} filters - Optional filters
 * @returns {Promise<Array>} - Array of templates
 */
const getTemplates = async (filters = {}) => {
    try {
        const query = { isActive: true };

        if (filters.status) {
            query.status = filters.status;
        }
        if (filters.category) {
            query.category = filters.category;
        }
        if (filters.language) {
            query.language = filters.language;
        }
        if (filters.tags && filters.tags.length > 0) {
            query.tags = { $in: filters.tags };
        }

        const templates = await Template.find(query).sort({ createdAt: -1 });
        return templates;
    } catch (error) {
        console.error('Error getting templates:', error);
        throw error;
    }
};

/**
 * Get single template by ID
 * @param {string} templateId - Template ID
 * @returns {Promise<Object>} - Template object
 */
const getTemplateById = async (templateId) => {
    try {
        const template = await Template.findById(templateId);
        return template;
    } catch (error) {
        console.error('Error getting template by ID:', error);
        throw error;
    }
};

/**
 * Get template by name
 * @param {string} name - Template name
 * @returns {Promise<Object>} - Template object
 */
const getTemplateByName = async (name) => {
    try {
        const template = await Template.findOne({ name, isActive: true });
        return template;
    } catch (error) {
        console.error('Error getting template by name:', error);
        throw error;
    }
};

/**
 * Update template metadata (CRM fields only, not WhatsApp fields)
 * @param {string} templateId - Template ID
 * @param {Object} updates - Fields to update
 * @returns {Promise<Object>} - Updated template
 */
const updateTemplate = async (templateId, updates) => {
    try {
        // Only allow updating CRM-specific fields
        const allowedUpdates = {
            description: updates.description,
            tags: updates.tags,
            isActive: updates.isActive
        };

        // Remove undefined fields
        Object.keys(allowedUpdates).forEach(key =>
            allowedUpdates[key] === undefined && delete allowedUpdates[key]
        );

        const template = await Template.findByIdAndUpdate(
            templateId,
            { $set: allowedUpdates },
            { new: true }
        );

        return template;
    } catch (error) {
        console.error('Error updating template:', error);
        throw error;
    }
};

/**
 * Delete template (soft delete)
 * @param {string} templateId - Template ID
 * @returns {Promise<Object>} - Deleted template
 */
const deleteTemplate = async (templateId) => {
    try {
        const template = await Template.findByIdAndUpdate(
            templateId,
            { $set: { isActive: false } },
            { new: true }
        );
        return template;
    } catch (error) {
        console.error('Error deleting template:', error);
        throw error;
    }
};

/**
 * Get template statistics
 * @returns {Promise<Object>} - Template statistics
 */
const getTemplateStats = async () => {
    try {
        const stats = await Template.aggregate([
            {
                $facet: {
                    total: [{ $count: 'count' }],
                    byStatus: [
                        { $group: { _id: '$status', count: { $sum: 1 } } }
                    ],
                    byCategory: [
                        { $group: { _id: '$category', count: { $sum: 1 } } }
                    ],
                    byLanguage: [
                        { $group: { _id: '$language', count: { $sum: 1 } } }
                    ],
                    mostUsed: [
                        { $sort: { usageCount: -1 } },
                        { $limit: 10 },
                        { $project: { name: 1, usageCount: 1, lastUsedAt: 1 } }
                    ]
                }
            }
        ]);

        return {
            total: stats[0].total[0]?.count || 0,
            byStatus: stats[0].byStatus,
            byCategory: stats[0].byCategory,
            byLanguage: stats[0].byLanguage,
            mostUsed: stats[0].mostUsed
        };
    } catch (error) {
        console.error('Error getting template stats:', error);
        throw error;
    }
};

module.exports = {
    fetchTemplatesFromMeta,
    syncTemplatesFromMeta,
    getTemplates,
    getTemplateById,
    getTemplateByName,
    updateTemplate,
    deleteTemplate,
    getTemplateStats
};
