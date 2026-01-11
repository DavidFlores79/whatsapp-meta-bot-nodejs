/**
 * E-commerce Integration Routes
 * 
 * API routes for accessing e-commerce data from the CRM frontend
 * Provides order lookup and product search capabilities for agents
 * 
 * @module routes/ecommerceRoutes
 */

const express = require('express');
const router = express.Router();
const ecommerceService = require('../services/ecommerceIntegrationService');
const { authenticateToken } = require('../middleware/authMiddleware');

/**
 * @route GET /api/v2/ecommerce/health
 * @desc Check e-commerce API connection status
 * @access Private (agents only)
 */
router.get('/health', authenticateToken, async (req, res) => {
    try {
        const isHealthy = await ecommerceService.healthCheck();
        res.json({
            success: true,
            connected: isHealthy,
            apiUrl: process.env.ECOMMERCE_API_URL || 'Not configured'
        });
    } catch (error) {
        res.status(500).json({
            success: false,
            connected: false,
            error: error.message
        });
    }
});

/**
 * @route GET /api/v2/ecommerce/orders/search
 * @desc Search for orders by order ID, phone, or email
 * @access Private (agents only)
 * @query {string} type - Search type: 'order_id', 'phone', or 'email'
 * @query {string} value - The value to search for
 * @query {number} limit - Max results (default: 5)
 */
router.get('/orders/search', authenticateToken, async (req, res) => {
    try {
        const { type, value, limit = 5 } = req.query;

        if (!type || !value) {
            return res.status(400).json({
                success: false,
                error: 'Missing required parameters: type and value'
            });
        }

        let orders = [];

        switch (type) {
            case 'order_id':
                const order = await ecommerceService.getOrderById(value);
                if (order) orders = [order];
                break;

            case 'phone':
                orders = await ecommerceService.getOrdersByPhone(value, parseInt(limit));
                break;

            case 'email':
                orders = await ecommerceService.getOrdersByEmail(value, parseInt(limit));
                break;

            default:
                return res.status(400).json({
                    success: false,
                    error: 'Invalid search type. Use: order_id, phone, or email'
                });
        }

        res.json({
            success: true,
            count: orders.length,
            orders
        });
    } catch (error) {
        console.error('Error searching e-commerce orders:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to search orders'
        });
    }
});

/**
 * @route GET /api/v2/ecommerce/orders/active/:phoneNumber
 * @desc Get active (pending/processing) orders for a customer
 * @access Private (agents only)
 */
router.get('/orders/active/:phoneNumber', authenticateToken, async (req, res) => {
    try {
        const { phoneNumber } = req.params;
        const orders = await ecommerceService.getActiveOrders(phoneNumber);

        res.json({
            success: true,
            count: orders.length,
            orders
        });
    } catch (error) {
        console.error('Error fetching active orders:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to fetch active orders'
        });
    }
});

/**
 * @route GET /api/v2/ecommerce/products/search
 * @desc Search products in the e-commerce catalog
 * @access Private (agents only)
 * @query {string} q - Search query
 * @query {number} limit - Max results (default: 10)
 */
router.get('/products/search', authenticateToken, async (req, res) => {
    try {
        const { q, limit = 10 } = req.query;

        if (!q) {
            return res.status(400).json({
                success: false,
                error: 'Missing required parameter: q (search query)'
            });
        }

        const products = await ecommerceService.searchProducts(q, parseInt(limit));

        res.json({
            success: true,
            count: products.length,
            products
        });
    } catch (error) {
        console.error('Error searching products:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to search products'
        });
    }
});

/**
 * @route GET /api/v2/ecommerce/products/:id
 * @desc Get product details by ID
 * @access Private (agents only)
 */
router.get('/products/:id', authenticateToken, async (req, res) => {
    try {
        const { id } = req.params;
        const product = await ecommerceService.getProductById(id);

        if (!product) {
            return res.status(404).json({
                success: false,
                error: 'Product not found'
            });
        }

        res.json({
            success: true,
            product
        });
    } catch (error) {
        console.error('Error fetching product:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to fetch product'
        });
    }
});

/**
 * @route GET /api/v2/ecommerce/categories
 * @desc Get all product categories
 * @access Private (agents only)
 */
router.get('/categories', authenticateToken, async (req, res) => {
    try {
        const categories = await ecommerceService.getCategories();

        res.json({
            success: true,
            count: categories.length,
            categories
        });
    } catch (error) {
        console.error('Error fetching categories:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to fetch categories'
        });
    }
});

/**
 * @route GET /api/v2/ecommerce/dashboard
 * @desc Get e-commerce dashboard summary
 * @access Private (admin/supervisor only)
 */
router.get('/dashboard', authenticateToken, async (req, res) => {
    try {
        // Check if user has admin/supervisor role
        if (!['admin', 'supervisor'].includes(req.agent.role)) {
            return res.status(403).json({
                success: false,
                error: 'Access denied. Admin or supervisor role required.'
            });
        }

        const dashboard = await ecommerceService.getDashboardSummary();

        if (!dashboard) {
            return res.status(503).json({
                success: false,
                error: 'E-commerce API unavailable'
            });
        }

        res.json({
            success: true,
            data: dashboard
        });
    } catch (error) {
        console.error('Error fetching e-commerce dashboard:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to fetch dashboard data'
        });
    }
});

/**
 * @route GET /api/v2/ecommerce/customer/:phoneNumber
 * @desc Find e-commerce customer by phone number
 * @access Private (agents only)
 */
router.get('/customer/:phoneNumber', authenticateToken, async (req, res) => {
    try {
        const { phoneNumber } = req.params;
        const customer = await ecommerceService.findCustomerByPhone(phoneNumber);

        if (!customer) {
            return res.status(404).json({
                success: false,
                error: 'Customer not found in e-commerce system'
            });
        }

        // Return limited customer info (exclude sensitive data)
        res.json({
            success: true,
            customer: {
                id: customer._id,
                name: customer.name,
                email: customer.email,
                phone: customer.phone,
                createdAt: customer.createdAt
            }
        });
    } catch (error) {
        console.error('Error finding customer:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to find customer'
        });
    }
});

/**
 * @route GET /api/v2/ecommerce/customer/:phoneNumber/profile
 * @desc Get customer profile with order statistics
 * @access Private (agents only)
 */
router.get('/customer/:phoneNumber/profile', authenticateToken, async (req, res) => {
    try {
        const { phoneNumber } = req.params;
        const profile = await ecommerceService.getCustomerProfile(phoneNumber);

        if (!profile) {
            return res.status(404).json({
                success: false,
                error: 'Customer not found in e-commerce system'
            });
        }

        res.json({
            success: true,
            profile: {
                id: profile._id,
                name: profile.name,
                email: profile.email,
                phone: profile.phone,
                createdAt: profile.createdAt,
                stats: profile.ecommerceStats
            }
        });
    } catch (error) {
        console.error('Error getting customer profile:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to get customer profile'
        });
    }
});

/**
 * @route GET /api/v2/ecommerce/status
 * @desc Get e-commerce integration status and configuration
 * @access Private (admin/supervisor only)
 */
router.get('/status', authenticateToken, async (req, res) => {
    try {
        // Check if user has admin/supervisor role
        if (!['admin', 'supervisor'].includes(req.agent.role)) {
            return res.status(403).json({
                success: false,
                error: 'Access denied. Admin or supervisor role required.'
            });
        }

        const status = await ecommerceService.getStatus();
        const isHealthy = status.enabled ? await ecommerceService.healthCheck() : false;

        res.json({
            success: true,
            status: {
                ...status,
                apiHealthy: isHealthy,
                apiUrl: status.enabled ? (status.apiUrl || 'Configured') : 'Not configured'
            }
        });
    } catch (error) {
        console.error('Error getting e-commerce status:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to get integration status'
        });
    }
});

/**
 * @route GET /api/v2/ecommerce/config
 * @desc Get e-commerce integration configuration
 * @access Private (admin only)
 */
router.get('/config', authenticateToken, async (req, res) => {
    try {
        // Check if user has admin role
        if (req.agent.role !== 'admin') {
            return res.status(403).json({
                success: false,
                error: 'Access denied. Admin role required.'
            });
        }

        const EcommerceConfig = require('../models/EcommerceConfig');
        const config = await EcommerceConfig.getDefault();

        // Return config without sensitive data
        res.json({
            success: true,
            config: {
                enabled: config.enabled,
                connection: {
                    apiUrl: config.connection.apiUrl,
                    authType: config.connection.authType,
                    serviceEmail: config.connection.serviceEmail,
                    // Don't return password
                    timeout: config.connection.timeout
                },
                features: config.features,
                fieldMapping: config.fieldMapping,
                cache: config.cache,
                lastConnected: config.lastConnected,
                healthStatus: config.healthStatus,
                lastError: config.lastError
            }
        });
    } catch (error) {
        console.error('Error getting e-commerce config:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to get configuration'
        });
    }
});

/**
 * @route PUT /api/v2/ecommerce/config
 * @desc Update e-commerce integration configuration
 * @access Private (admin only)
 */
router.put('/config', authenticateToken, async (req, res) => {
    try {
        // Check if user has admin role
        if (req.agent.role !== 'admin') {
            return res.status(403).json({
                success: false,
                error: 'Access denied. Admin role required.'
            });
        }

        const { enabled, connection, features, fieldMapping, cache } = req.body;
        const EcommerceConfig = require('../models/EcommerceConfig');

        const updates = {};

        if (enabled !== undefined) {
            updates.enabled = enabled;
        }

        if (connection) {
            updates['connection.apiUrl'] = connection.apiUrl;
            updates['connection.authType'] = connection.authType || 'jwt';
            if (connection.serviceEmail) {
                updates['connection.serviceEmail'] = connection.serviceEmail;
            }
            if (connection.servicePassword) {
                updates['connection.servicePassword'] = connection.servicePassword;
            }
            if (connection.apiKey) {
                updates['connection.apiKey'] = connection.apiKey;
            }
            if (connection.timeout) {
                updates['connection.timeout'] = connection.timeout;
            }
        }

        if (features) {
            Object.keys(features).forEach(key => {
                updates[`features.${key}`] = features[key];
            });
        }

        if (fieldMapping) {
            updates['fieldMapping.customerIdentifier'] = fieldMapping.customerIdentifier;
            updates['fieldMapping.phoneFormat'] = fieldMapping.phoneFormat;
        }

        if (cache) {
            updates['cache.ttl'] = cache.ttl;
            updates['cache.cacheProducts'] = cache.cacheProducts;
            updates['cache.cacheCustomers'] = cache.cacheCustomers;
        }

        const updatedConfig = await EcommerceConfig.updateDefault(updates);

        // Force reload configuration in the service
        ecommerceService.configLoaded = false;
        await ecommerceService.loadConfiguration();

        res.json({
            success: true,
            message: 'Configuration updated successfully',
            config: {
                enabled: updatedConfig.enabled,
                features: updatedConfig.features,
                healthStatus: updatedConfig.healthStatus
            }
        });
    } catch (error) {
        console.error('Error updating e-commerce config:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to update configuration'
        });
    }
});

/**
 * @route POST /api/v2/ecommerce/config/test
 * @desc Test e-commerce API connection
 * @access Private (admin only)
 */
router.post('/config/test', authenticateToken, async (req, res) => {
    try {
        // Check if user has admin role
        if (req.agent.role !== 'admin') {
            return res.status(403).json({
                success: false,
                error: 'Access denied. Admin role required.'
            });
        }

        // Force reload configuration and test connection
        ecommerceService.configLoaded = false;
        await ecommerceService.loadConfiguration();

        const isAvailable = await ecommerceService.isAvailable();
        const isHealthy = isAvailable ? await ecommerceService.healthCheck() : false;

        if (isAvailable && isHealthy) {
            const EcommerceConfig = require('../models/EcommerceConfig');
            const config = await EcommerceConfig.getDefault();
            await config.recordSuccess();

            res.json({
                success: true,
                message: 'Connection successful',
                healthy: true
            });
        } else {
            res.json({
                success: true,
                message: isAvailable 
                    ? 'Connection failed - API unreachable' 
                    : 'Integration not configured or disabled',
                healthy: false
            });
        }
    } catch (error) {
        console.error('Error testing e-commerce connection:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to test connection'
        });
    }
});

/**
 * @route GET /api/v2/ecommerce/delivery-options
 * @desc Get available delivery options
 * @access Private (agents only)
 */
router.get('/delivery-options', authenticateToken, async (req, res) => {
    try {
        const options = await ecommerceService.getDeliveryOptions();
        res.json({
            success: true,
            options
        });
    } catch (error) {
        console.error('Error fetching delivery options:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to fetch delivery options'
        });
    }
});

/**
 * @route GET /api/v2/ecommerce/payment-methods
 * @desc Get available payment methods
 * @access Private (agents only)
 */
router.get('/payment-methods', authenticateToken, async (req, res) => {
    try {
        const methods = await ecommerceService.getPaymentMethods();
        res.json({
            success: true,
            methods
        });
    } catch (error) {
        console.error('Error fetching payment methods:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to fetch payment methods'
        });
    }
});

/**
 * @route POST /api/v2/ecommerce/orders
 * @desc Create a new order (for agent-assisted ordering)
 * @access Private (agents only)
 */
router.post('/orders', authenticateToken, async (req, res) => {
    try {
        const { customerPhone, items, paymentMethod, address, deliveryOption, deliveryDate, notes } = req.body;

        if (!customerPhone || !items || items.length === 0) {
            return res.status(400).json({
                success: false,
                error: 'Missing required fields: customerPhone, items'
            });
        }

        const result = await ecommerceService.createOrder({
            customerPhone,
            items,
            paymentMethod,
            address,
            deliveryOption,
            deliveryDate,
            notes: notes || `Order created by agent ${req.agent.name}`
        });

        if (result.error) {
            return res.status(400).json({
                success: false,
                error: result.error
            });
        }

        res.json({
            success: true,
            order: result
        });
    } catch (error) {
        console.error('Error creating order:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to create order'
        });
    }
});

/**
 * @route POST /api/v2/ecommerce/orders/:orderId/send-update
 * @desc Send order update summary to customer via WhatsApp template
 * @access Private (agents only)
 * @param {string} orderId - MongoDB Order ID (_id)
 * @body {string} conversationId - Conversation ID to send message to
 * @body {string} [templateName] - Optional template name (defaults to 'order_status_update')
 * @body {string} [languageCode] - Optional language code (defaults to 'es_MX')
 */
router.post('/orders/:orderId/send-update', authenticateToken, async (req, res) => {
    try {
        const { orderId } = req.params;
        const { conversationId, templateName = 'order_status_update', languageCode = 'es_MX' } = req.body;

        if (!conversationId) {
            return res.status(400).json({
                success: false,
                error: 'Missing required field: conversationId'
            });
        }

        // Get order details by MongoDB _id
        const order = await ecommerceService.getOrderByMongoId(orderId);
        if (!order) {
            return res.status(404).json({
                success: false,
                error: 'Order not found'
            });
        }

        // Get conversation to find phone number and customer
        const Conversation = require('../models/Conversation');
        const conversation = await Conversation.findById(conversationId).populate('customerId');
        if (!conversation) {
            return res.status(404).json({
                success: false,
                error: 'Conversation not found'
            });
        }

        // Build order items list for template parameter
        const itemsList = order.items.map((item, index) =>
            `${index + 1}. ${item.productName} - Cant: ${item.quantity} - $${item.subtotal.toFixed(2)}`
        ).join('\n');

        // Template parameters (adjust based on your actual template structure)
        // Expected template format: "Actualización de Orden {{1}} - Estado: {{2}} - Items: {{3}} - Total: {{4}}"
        const parameters = [
            { type: 'text', text: order.orderId },
            { type: 'text', text: order.statusLabel },
            { type: 'text', text: itemsList },
            { type: 'text', text: `$${order.total.toFixed(2)}` }
        ];

        // Add notes if present (adjust parameter index as needed)
        if (order.notes) {
            parameters.push({ type: 'text', text: order.notes });
        }

        // Send via template message service
        const templateMessageService = require('../services/templateMessageService');
        
        const result = await templateMessageService.sendTemplateMessage({
            templateName,
            languageCode,
            parameters,
            phoneNumber: conversation.phoneNumber,
            customerId: conversation.customerId._id,
            conversationId: conversation._id,
            agentId: req.agent._id,
            sender: 'agent',
            saveToDatabase: true,
            emitSocketEvents: true
        });

        res.json({
            success: true,
            message: 'Order update sent successfully',
            data: {
                messageId: result.message?._id,
                displayContent: result.displayContent
            }
        });
    } catch (error) {
        console.error('Error sending order update:', error);
        
        // More detailed error response
        const errorMessage = error.message || 'Failed to send order update';
        res.status(500).json({
            success: false,
            error: errorMessage,
            details: process.env.NODE_ENV === 'development' ? error.stack : undefined
        });
    }
});

module.exports = router;
