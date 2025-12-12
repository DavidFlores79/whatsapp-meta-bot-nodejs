const templateService = require('../services/templateService');
const Template = require('../models/Template');
const Customer = require('../models/Customer');
const Conversation = require('../models/Conversation');
const Message = require('../models/Message');
const whatsappService = require('../services/whatsappService');
const { buildTemplateJSON } = require('../shared/whatsappModels');

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

        // Format parameters for WhatsApp API
        const formattedParams = parameters ? parameters.map(param => ({
            type: "text",
            text: param
        })) : [];

        // Build template message
        const templateMessage = buildTemplateJSON(
            customer.phoneNumber,
            template.name,
            formattedParams,
            template.language
        );

        // Send via WhatsApp
        whatsappService.sendWhatsappResponse(templateMessage);

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

        // Save message to database
        const message = await Message.create({
            conversationId: conversation._id,
            customerId: customer._id,
            content: `Template: ${template.name}`,
            type: 'template',
            direction: 'outbound',
            sender: 'agent',
            agentId: req.agent?._id,
            status: 'sent',
            template: {
                name: template.name,
                language: template.language,
                parameters: parameters || [],
                category: template.category
            }
        });

        // Update template usage
        await template.incrementUsage();

        // Update conversation
        await Conversation.findByIdAndUpdate(conversation._id, {
            lastMessageAt: new Date(),
            $inc: { messageCount: 1 }
        });

        // Emit Socket.io event
        if (req.io) {
            req.io.emit('new_message', {
                conversationId: conversation._id,
                message
            });
        }

        res.status(200).json({
            success: true,
            message: 'Template sent successfully',
            data: {
                template: template.name,
                customer: customer.phoneNumber,
                messageId: message._id
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
                // Format parameters (can be customized per customer if needed)
                const formattedParams = parameters ? parameters.map(param => ({
                    type: "text",
                    text: param
                })) : [];

                // Build template message
                const templateMessage = buildTemplateJSON(
                    customer.phoneNumber,
                    template.name,
                    formattedParams,
                    template.language
                );

                // Send via WhatsApp
                whatsappService.sendWhatsappResponse(templateMessage);

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

                // Save message to database
                const message = await Message.create({
                    conversationId: conversation._id,
                    customerId: customer._id,
                    content: `Template: ${template.name}`,
                    type: 'template',
                    direction: 'outbound',
                    sender: 'system',
                    agentId: req.agent?._id,
                    status: 'sent',
                    template: {
                        name: template.name,
                        language: template.language,
                        parameters: parameters || [],
                        category: template.category
                    }
                });

                // Update conversation
                await Conversation.findByIdAndUpdate(conversation._id, {
                    lastMessageAt: new Date(),
                    $inc: { messageCount: 1 }
                });

                // Emit Socket.io event
                if (req.io) {
                    req.io.emit('new_message', {
                        conversationId: conversation._id,
                        message
                    });
                }

                results.sent++;

                // Add delay to prevent rate limiting (adjust as needed)
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

        // Update template usage
        await Template.findByIdAndUpdate(templateId, {
            $inc: { usageCount: results.sent },
            lastUsedAt: new Date()
        });

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
