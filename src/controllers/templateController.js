const templateService = require('../services/templateService');
const Template = require('../models/Template');
const Customer = require('../models/Customer');
const Conversation = require('../models/Conversation');
const templateMessageService = require('../services/templateMessageService');

/**
 * Sync templates from Meta WhatsApp API
 * POST /api/v2/templates/sync
 */
const syncTemplates = async (req, res) => {
    try {
        console.log('Syncing templates from Meta WhatsApp API...');
        const stats = await templateService.syncTemplatesFromMeta();

        res.status(200).json({
            success: true,
            message: 'Templates synced successfully',
            data: stats
        });
    } catch (error) {
        console.error('Error syncing templates:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to sync templates',
            error: error.message
        });
    }
};

/**
 * Get all templates with optional filters
 * GET /api/v2/templates
 */
const getTemplates = async (req, res) => {
    try {
        const filters = {
            status: req.query.status,
            category: req.query.category,
            language: req.query.language,
            tags: req.query.tags ? req.query.tags.split(',') : undefined
        };

        // Remove undefined filters
        Object.keys(filters).forEach(key =>
            filters[key] === undefined && delete filters[key]
        );

        const templates = await templateService.getTemplates(filters);

        res.status(200).json({
            success: true,
            data: templates,
            count: templates.length
        });
    } catch (error) {
        console.error('Error getting templates:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to get templates',
            error: error.message
        });
    }
};

/**
 * Get single template by ID
 * GET /api/v2/templates/:id
 */
const getTemplateById = async (req, res) => {
    try {
        const template = await templateService.getTemplateById(req.params.id);

        if (!template) {
            return res.status(404).json({
                success: false,
                message: 'Template not found'
            });
        }

        res.status(200).json({
            success: true,
            data: template
        });
    } catch (error) {
        console.error('Error getting template:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to get template',
            error: error.message
        });
    }
};

/**
 * Update template metadata
 * PUT /api/v2/templates/:id
 */
const updateTemplate = async (req, res) => {
    try {
        const updates = {
            description: req.body.description,
            tags: req.body.tags,
            isActive: req.body.isActive
        };

        const template = await templateService.updateTemplate(req.params.id, updates);

        if (!template) {
            return res.status(404).json({
                success: false,
                message: 'Template not found'
            });
        }

        res.status(200).json({
            success: true,
            message: 'Template updated successfully',
            data: template
        });
    } catch (error) {
        console.error('Error updating template:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to update template',
            error: error.message
        });
    }
};

/**
 * Delete template (soft delete)
 * DELETE /api/v2/templates/:id
 */
const deleteTemplate = async (req, res) => {
    try {
        const template = await templateService.deleteTemplate(req.params.id);

        if (!template) {
            return res.status(404).json({
                success: false,
                message: 'Template not found'
            });
        }

        res.status(200).json({
            success: true,
            message: 'Template deleted successfully',
            data: template
        });
    } catch (error) {
        console.error('Error deleting template:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to delete template',
            error: error.message
        });
    }
};

/**
 * Get template statistics
 * GET /api/v2/templates/stats
 */
const getTemplateStats = async (req, res) => {
    try {
        const stats = await templateService.getTemplateStats();

        res.status(200).json({
            success: true,
            data: stats
        });
    } catch (error) {
        console.error('Error getting template stats:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to get template statistics',
            error: error.message
        });
    }
};

/**
 * Send template message to single customer
 * POST /api/v2/templates/send
 */
const sendTemplateToCustomer = async (req, res) => {
    try {
        const { templateId, customerId, parameters } = req.body;

        if (!templateId || !customerId) {
            return res.status(400).json({
                success: false,
                message: 'Template ID and Customer ID are required'
            });
        }

        // Get template
        const template = await Template.findById(templateId);
        if (!template) {
            return res.status(404).json({
                success: false,
                message: 'Template not found'
            });
        }

        if (template.status !== 'APPROVED') {
            return res.status(400).json({
                success: false,
                message: `Template is not approved. Current status: ${template.status}`
            });
        }

        // Get customer
        const customer = await Customer.findById(customerId);
        if (!customer) {
            return res.status(404).json({
                success: false,
                message: 'Customer not found'
            });
        }

        // Find or create conversation
        let conversation = await Conversation.findOne({
            customerId: customer._id,
            status: { $in: ['open', 'assigned'] }
        });

        if (!conversation) {
            conversation = await Conversation.create({
                customerId: customer._id,
                status: 'open',
                priority: 'medium',
                isAIEnabled: true,
                lastMessageAt: new Date()
            });
        }

        // Format parameters for WhatsApp API
        const formattedParams = parameters ? parameters.map(param => ({
            type: "text",
            text: param
        })) : [];

        // Send via centralized service (saves to DB, emits Socket.io, injects AI context)
        const result = await templateMessageService.sendTemplateMessage({
            templateName: template.name,
            languageCode: template.language,
            parameters: formattedParams,
            phoneNumber: customer.phoneNumber,
            customerId: customer._id,
            conversationId: conversation._id,
            agentId: req.agent?._id || null,
            sender: 'agent'
        });

        res.status(200).json({
            success: true,
            message: 'Template sent successfully',
            data: {
                template: template.name,
                customer: customer.phoneNumber,
                messageId: result.message?._id
            }
        });
    } catch (error) {
        console.error('Error sending template:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to send template',
            error: error.message
        });
    }
};

/**
 * Send template message to multiple customers (bulk)
 * POST /api/v2/templates/send-bulk
 */
const sendTemplateBulk = async (req, res) => {
    try {
        const { templateId, customerIds, parameters, filters } = req.body;

        if (!templateId) {
            return res.status(400).json({
                success: false,
                message: 'Template ID is required'
            });
        }

        // Get template
        const template = await Template.findById(templateId);
        if (!template) {
            return res.status(404).json({
                success: false,
                message: 'Template not found'
            });
        }

        if (template.status !== 'APPROVED') {
            return res.status(400).json({
                success: false,
                message: `Template is not approved. Current status: ${template.status}`
            });
        }

        // Get customers
        let customers = [];
        if (customerIds && customerIds.length > 0) {
            customers = await Customer.find({ _id: { $in: customerIds } });
        } else if (filters) {
            // Build query from filters
            const query = {};
            if (filters.tags && filters.tags.length > 0) {
                query.tags = { $in: filters.tags };
            }
            if (filters.status) {
                query.status = filters.status;
            }
            customers = await Customer.find(query);
        } else {
            return res.status(400).json({
                success: false,
                message: 'Either customerIds or filters are required'
            });
        }

        if (customers.length === 0) {
            return res.status(404).json({
                success: false,
                message: 'No customers found'
            });
        }

        const results = {
            total: customers.length,
            sent: 0,
            failed: 0,
            errors: []
        };

        // Send template to each customer
        for (const customer of customers) {
            try {
                // Find or create conversation
                let conversation = await Conversation.findOne({
                    customerId: customer._id,
                    status: { $in: ['open', 'assigned'] }
                });

                if (!conversation) {
                    conversation = await Conversation.create({
                        customerId: customer._id,
                        status: 'open',
                        priority: 'medium',
                        isAIEnabled: true,
                        lastMessageAt: new Date()
                    });
                }

                // Format parameters for WhatsApp API
                const formattedParams = parameters ? parameters.map(param => ({
                    type: "text",
                    text: param
                })) : [];

                // Send via centralized service (saves to DB, emits Socket.io, injects AI context)
                await templateMessageService.sendTemplateMessage({
                    templateName: template.name,
                    languageCode: template.language,
                    parameters: formattedParams,
                    phoneNumber: customer.phoneNumber,
                    customerId: customer._id,
                    conversationId: conversation._id,
                    agentId: req.agent?._id || null,
                    sender: 'agent'
                });

                results.sent++;

                // Delay to prevent rate limiting
                await new Promise(resolve => setTimeout(resolve, 1000));

            } catch (error) {
                console.error(`Error sending template to ${customer.phoneNumber}:`, error);
                results.failed++;
                results.errors.push({
                    customer: customer.phoneNumber,
                    error: error.message
                });
            }
        }

        res.status(200).json({
            success: true,
            message: 'Bulk template sending completed',
            data: results
        });
    } catch (error) {
        console.error('Error sending bulk templates:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to send bulk templates',
            error: error.message
        });
    }
};

module.exports = {
    syncTemplates,
    getTemplates,
    getTemplateById,
    updateTemplate,
    deleteTemplate,
    getTemplateStats,
    sendTemplateToCustomer,
    sendTemplateBulk
};
