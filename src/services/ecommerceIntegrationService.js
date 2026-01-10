/**
 * E-commerce Integration Service
 * 
 * Connects the WhatsApp CRM Bot with an external e-commerce backend API (La Bella Italia)
 * Provides order lookup, product information, and customer data for AI-assisted support
 * 
 * IMPORTANT: This service only works when an e-commerce compatible preset is active
 * Compatible presets: 'ecommerce', 'restaurant'
 * 
 * @module services/ecommerceIntegrationService
 */

const axios = require('axios');

// E-commerce compatible preset IDs
// Note: Restaurant will have its own separate integration
const ECOMMERCE_COMPATIBLE_PRESETS = ['ecommerce'];

class EcommerceIntegrationService {
    constructor() {
        // Configuration will be loaded from database
        this.config = null;
        this.configLoaded = false;
        
        // Authentication
        this.serviceToken = null;
        this.tokenExpiry = null;

        // Cache configuration
        this.cache = new Map();
        this.cacheTTL = 5 * 60 * 1000; // 5 minutes
        
        // Integration status
        this.isEnabled = false;
        this.lastError = null;
    }

    /**
     * Load e-commerce configuration from database
     * @returns {Promise<object|null>} Configuration or null if not configured
     */
    async loadConfiguration() {
        try {
            const configService = require('./configurationService');
            
            // First check if we have an e-commerce compatible preset active
            const assistantConfig = await configService.getAssistantConfig();
            const activePresetId = assistantConfig.presetId || 'luxfree';
            
            if (!ECOMMERCE_COMPATIBLE_PRESETS.includes(activePresetId)) {
                console.log(`📦 E-commerce integration disabled - current preset: ${activePresetId}`);
                this.isEnabled = false;
                this.configLoaded = true;
                return null;
            }
            
            // Try loading from EcommerceConfig model first
            let ecommerceConfig = null;
            try {
                const EcommerceConfig = require('../models/EcommerceConfig');
                const dbConfig = await EcommerceConfig.getDefault();
                if (dbConfig && dbConfig.enabled) {
                    ecommerceConfig = {
                        enabled: dbConfig.enabled,
                        apiUrl: dbConfig.connection.apiUrl,
                        apiKey: dbConfig.connection.apiKey,
                        serviceEmail: dbConfig.connection.serviceEmail,
                        servicePassword: dbConfig.connection.servicePassword,
                        features: dbConfig.features
                    };
                }
            } catch (modelError) {
                console.log('📦 EcommerceConfig model not available, trying legacy config');
            }
            
            // Fallback to legacy configuration
            if (!ecommerceConfig) {
                ecommerceConfig = await configService.getSetting('ecommerce_integration', null);
            }
            
            // Final fallback to environment variables
            if (!ecommerceConfig && process.env.ECOMMERCE_API_URL) {
                ecommerceConfig = {
                    enabled: true,
                    apiUrl: process.env.ECOMMERCE_API_URL,
                    serviceEmail: process.env.ECOMMERCE_SERVICE_EMAIL,
                    servicePassword: process.env.ECOMMERCE_SERVICE_PASSWORD,
                    features: {
                        orderLookup: true,
                        orderCreate: false,
                        productSearch: true,
                        customerLink: true,
                        webhooks: false
                    }
                };
            }
            
            if (!ecommerceConfig || !ecommerceConfig.enabled) {
                console.log('📦 E-commerce integration not configured or disabled');
                this.isEnabled = false;
                this.configLoaded = true;
                return null;
            }
            
            this.config = {
                baseUrl: ecommerceConfig.apiUrl || process.env.ECOMMERCE_API_URL,
                apiKey: ecommerceConfig.apiKey || process.env.ECOMMERCE_API_KEY,
                serviceEmail: ecommerceConfig.serviceEmail || process.env.ECOMMERCE_SERVICE_EMAIL,
                servicePassword: ecommerceConfig.servicePassword || process.env.ECOMMERCE_SERVICE_PASSWORD,
                features: ecommerceConfig.features || {
                    orderLookup: true,
                    orderCreate: false,
                    productSearch: true,
                    customerLink: true,
                    webhooks: false
                },
                presetId: activePresetId
            };
            
            this.isEnabled = true;
            this.configLoaded = true;
            console.log(`✅ E-commerce integration enabled for preset: ${activePresetId}`);
            return this.config;
            
        } catch (error) {
            console.error('❌ Error loading e-commerce configuration:', error.message);
            this.lastError = error.message;
            this.configLoaded = true;
            return null;
        }
    }

    /**
     * Check if e-commerce integration is available
     * @returns {Promise<boolean>}
     */
    async isAvailable() {
        if (!this.configLoaded) {
            await this.loadConfiguration();
        }
        return this.isEnabled && this.config !== null;
    }

    /**
     * Check if a specific feature is enabled
     * @param {string} feature - Feature name: 'orderLookup', 'orderCreate', 'productSearch', 'customerLink', 'webhooks'
     * @returns {Promise<boolean>}
     */
    async isFeatureEnabled(feature) {
        if (!await this.isAvailable()) {
            return false;
        }
        return this.config.features[feature] === true;
    }

    /**
     * Get integration status for debugging/admin
     * @returns {Promise<object>}
     */
    async getStatus() {
        if (!this.configLoaded) {
            await this.loadConfiguration();
        }
        
        return {
            enabled: this.isEnabled,
            configured: this.config !== null,
            presetId: this.config?.presetId || null,
            features: this.config?.features || {},
            apiUrl: this.config?.baseUrl ? this.config.baseUrl.replace(/\/\/.*@/, '//***@') : null, // Hide credentials
            lastError: this.lastError,
            tokenValid: this.serviceToken && this.tokenExpiry && Date.now() < this.tokenExpiry
        };
    }

    /**
     * Get or refresh authentication token for e-commerce API
     * @returns {Promise<string>} JWT token
     */
    async getAuthToken() {
        if (!await this.isAvailable()) {
            throw new Error('E-commerce integration not available');
        }

        // Return cached token if still valid
        if (this.serviceToken && this.tokenExpiry && Date.now() < this.tokenExpiry) {
            return this.serviceToken;
        }

        // If using API key
        if (this.config.apiKey) {
            return this.config.apiKey;
        }

        // Authenticate with service account
        if (!this.config.serviceEmail || !this.config.servicePassword) {
            throw new Error('E-commerce service credentials not configured');
        }

        try {
            const response = await axios.post(`${this.config.baseUrl}/auth/login`, {
                email: this.config.serviceEmail,
                password: this.config.servicePassword
            }, { timeout: 10000 });

            this.serviceToken = response.data.jwt;
            // Token expires in 23 hours (refresh before 24h expiry)
            this.tokenExpiry = Date.now() + (23 * 60 * 60 * 1000);
            
            console.log('🔐 E-commerce API token refreshed');
            return this.serviceToken;
        } catch (error) {
            this.lastError = `Authentication failed: ${error.message}`;
            console.error('❌ Failed to authenticate with e-commerce API:', error.message);
            throw new Error('E-commerce authentication failed');
        }
    }

    /**
     * Make authenticated request to e-commerce API
     * @param {string} method - HTTP method
     * @param {string} endpoint - API endpoint
     * @param {object} data - Request body (for POST/PUT)
     * @param {object} params - Query parameters
     * @returns {Promise<object>} API response data
     */
    async makeRequest(method, endpoint, data = null, params = {}) {
        if (!await this.isAvailable()) {
            throw new Error('E-commerce integration not available');
        }

        const token = await this.getAuthToken();
        
        const config = {
            method,
            url: `${this.config.baseUrl}${endpoint}`,
            headers: {
                'Authorization': `Bearer ${token}`,
                'Content-Type': 'application/json'
            },
            params,
            timeout: 10000 // 10 second timeout
        };

        if (data) {
            config.data = data;
        }

        try {
            const response = await axios(config);
            return response.data;
        } catch (error) {
            if (error.response?.status === 401) {
                // Token expired, clear and retry once
                this.serviceToken = null;
                this.tokenExpiry = null;
                const newToken = await this.getAuthToken();
                config.headers.Authorization = `Bearer ${newToken}`;
                const retryResponse = await axios(config);
                return retryResponse.data;
            }
            this.lastError = `API request failed: ${error.message}`;
            throw error;
        }
    }

    // ============================================
    // ORDER MANAGEMENT
    // ============================================
    // ORDER MANAGEMENT
    // ============================================

    /**
     * Get order by order ID (e.g., "ORD-2025-000123")
     * @param {string} orderId - The order ID string
     * @returns {Promise<object|null>} Order object or null if not found
     */
    async getOrderById(orderId) {
        if (!await this.isFeatureEnabled('orderLookup')) {
            console.log('📦 Order lookup feature is disabled');
            return null;
        }

        try {
            // First try to search by orderId field
            const response = await this.makeRequest('GET', '/api/orders', null, {
                search: orderId,
                page_size: 1
            });

            if (response.data && response.data.length > 0) {
                return this.formatOrderForCRM(response.data[0]);
            }
            
            return null;
        } catch (error) {
            console.error(`❌ Error fetching order ${orderId}:`, error.message);
            return null;
        }
    }

    /**
     * Get orders by customer phone number
     * @param {string} phoneNumber - Customer phone number
     * @param {number} limit - Max number of orders to return
     * @returns {Promise<Array>} Array of order objects
     */
    async getOrdersByPhone(phoneNumber, limit = 5) {
        if (!await this.isFeatureEnabled('orderLookup')) {
            return [];
        }

        try {
            // First find the customer by phone
            const customer = await this.findCustomerByPhone(phoneNumber);
            
            if (!customer) {
                return [];
            }

            // Get recent orders for this customer
            const response = await this.makeRequest('GET', '/api/orders', null, {
                search: customer._id, // Search by customer ID
                page_size: limit,
                status: '' // All statuses
            });

            if (response.data && response.data.length > 0) {
                return response.data.map(order => this.formatOrderForCRM(order));
            }

            return [];
        } catch (error) {
            console.error(`❌ Error fetching orders for phone ${phoneNumber}:`, error.message);
            return [];
        }
    }

    /**
     * Get orders by customer email
     * @param {string} email - Customer email
     * @param {number} limit - Max number of orders to return
     * @returns {Promise<Array>} Array of order objects
     */
    async getOrdersByEmail(email, limit = 5) {
        if (!await this.isFeatureEnabled('orderLookup')) {
            return [];
        }

        try {
            const customer = await this.findCustomerByEmail(email);
            
            if (!customer) {
                return [];
            }

            const response = await this.makeRequest('GET', '/api/orders', null, {
                search: customer._id,
                page_size: limit
            });

            if (response.data && response.data.length > 0) {
                return response.data.map(order => this.formatOrderForCRM(order));
            }

            return [];
        } catch (error) {
            console.error(`❌ Error fetching orders for email ${email}:`, error.message);
            return [];
        }
    }

    /**
     * Get pending/processing orders for a customer
     * @param {string} phoneNumber - Customer phone number
     * @returns {Promise<Array>} Array of active order objects
     */
    async getActiveOrders(phoneNumber) {
        if (!await this.isFeatureEnabled('orderLookup')) {
            return [];
        }

        try {
            const customer = await this.findCustomerByPhone(phoneNumber);
            
            if (!customer) {
                return [];
            }

            // Get pending and processing orders
            const [pending, processing] = await Promise.all([
                this.makeRequest('GET', '/api/orders', null, {
                    status: 'pending',
                    page_size: 10
                }),
                this.makeRequest('GET', '/api/orders', null, {
                    status: 'processing',
                    page_size: 10
                })
            ]);

            const allOrders = [...(pending.data || []), ...(processing.data || [])];
            
            // Filter by customer ID
            const customerOrders = allOrders.filter(order => 
                order.customer?._id === customer._id || order.customer === customer._id
            );

            return customerOrders.map(order => this.formatOrderForCRM(order));
        } catch (error) {
            console.error(`❌ Error fetching active orders:`, error.message);
            return [];
        }
    }

    // ============================================
    // CUSTOMER LOOKUP
    // ============================================

    /**
     * Find customer by phone number
     * @param {string} phoneNumber - Phone number to search
     * @returns {Promise<object|null>} Customer object or null
     */
    async findCustomerByPhone(phoneNumber) {
        if (!await this.isFeatureEnabled('customerLink')) {
            return null;
        }

        const cacheKey = `customer_phone_${phoneNumber}`;
        
        // Check cache
        const cached = this.getFromCache(cacheKey);
        if (cached) return cached;

        try {
            const response = await this.makeRequest('GET', '/api/users', null, {
                search: phoneNumber,
                page_size: 1
            });

            if (response.data && response.data.length > 0) {
                const customer = response.data[0];
                this.setCache(cacheKey, customer);
                return customer;
            }

            return null;
        } catch (error) {
            console.error(`❌ Error finding customer by phone ${phoneNumber}:`, error.message);
            return null;
        }
    }

    /**
     * Find customer by email
     * @param {string} email - Email to search
     * @returns {Promise<object|null>} Customer object or null
     */
    async findCustomerByEmail(email) {
        if (!await this.isFeatureEnabled('customerLink')) {
            return null;
        }

        const cacheKey = `customer_email_${email}`;
        
        const cached = this.getFromCache(cacheKey);
        if (cached) return cached;

        try {
            const response = await this.makeRequest('GET', '/api/users', null, {
                search: email,
                page_size: 1
            });

            if (response.data && response.data.length > 0) {
                const customer = response.data[0];
                this.setCache(cacheKey, customer);
                return customer;
            }

            return null;
        } catch (error) {
            console.error(`❌ Error finding customer by email ${email}:`, error.message);
            return null;
        }
    }

    /**
     * Get customer profile with order history summary
     * @param {string} phoneNumber - Customer phone number
     * @returns {Promise<object|null>} Customer profile with stats
     */
    async getCustomerProfile(phoneNumber) {
        if (!await this.isFeatureEnabled('customerLink')) {
            return null;
        }

        try {
            const customer = await this.findCustomerByPhone(phoneNumber);
            if (!customer) return null;

            // Get order stats
            const orders = await this.getOrdersByPhone(phoneNumber, 50);
            
            const stats = {
                totalOrders: orders.length,
                totalSpent: orders.reduce((sum, o) => sum + (o.total || 0), 0),
                completedOrders: orders.filter(o => o.status === 'completed').length,
                pendingOrders: orders.filter(o => ['pending', 'processing'].includes(o.status)).length,
                lastOrder: orders.length > 0 ? orders[0] : null
            };

            return {
                ...customer,
                ecommerceStats: stats
            };
        } catch (error) {
            console.error(`❌ Error getting customer profile:`, error.message);
            return null;
        }
    }

    // ============================================
    // PRODUCT INFORMATION
    // ============================================

    /**
     * Search products by name or category
     * @param {string} query - Search query
     * @param {number} limit - Max results
     * @returns {Promise<Array>} Array of products
     */
    async searchProducts(query, limit = 5) {
        if (!await this.isFeatureEnabled('productSearch')) {
            return [];
        }

        try {
            const response = await this.makeRequest('GET', '/api/products', null, {
                search: query,
                page_size: limit
            });

            if (response.data && response.data.length > 0) {
                return response.data.map(product => this.formatProductForCRM(product));
            }

            return [];
        } catch (error) {
            console.error(`❌ Error searching products:`, error.message);
            return [];
        }
    }

    /**
     * Get product details by ID
     * @param {string} productId - Product ID
     * @returns {Promise<object|null>} Product object or null
     */
    async getProductById(productId) {
        if (!await this.isFeatureEnabled('productSearch')) {
            return null;
        }

        try {
            const response = await this.makeRequest('GET', `/api/products/${productId}`);
            return this.formatProductForCRM(response);
        } catch (error) {
            console.error(`❌ Error fetching product ${productId}:`, error.message);
            return null;
        }
    }

    /**
     * Get all categories
     * @returns {Promise<Array>} Array of categories
     */
    async getCategories() {
        if (!await this.isFeatureEnabled('productSearch')) {
            return [];
        }

        const cacheKey = 'categories_all';
        
        const cached = this.getFromCache(cacheKey);
        if (cached) return cached;

        try {
            const response = await this.makeRequest('GET', '/api/categories');
            
            if (response.data) {
                this.setCache(cacheKey, response.data, 30 * 60 * 1000); // 30 min cache
                return response.data;
            }

            return [];
        } catch (error) {
            console.error(`❌ Error fetching categories:`, error.message);
            return [];
        }
    }

    // ============================================
    // DASHBOARD / SUMMARY DATA
    // ============================================

    /**
     * Get dashboard summary for admin/agent view
     * @returns {Promise<object>} Dashboard data
     */
    async getDashboardSummary() {
        if (!await this.isAvailable()) {
            return null;
        }

        try {
            const response = await this.makeRequest('GET', '/api/dashboard');
            return {
                totalCategories: response.totalCategories || 0,
                totalProducts: response.totalProducts || 0,
                activeUsers: response.activeUsers || 0,
                pendingOrders: response.pendingOrders || 0,
                recentActivities: response.recentActivities || [],
                salesPerformance: response.salesPerformance || []
            };
        } catch (error) {
            console.error(`❌ Error fetching dashboard:`, error.message);
            return null;
        }
    }

    // ============================================
    // ORDER CREATION (BI-DIRECTIONAL)
    // ============================================

    /**
     * Create a new order via WhatsApp (phone order)
     * @param {object} orderData - Order details
     * @param {string} orderData.customerPhone - Customer phone number
     * @param {Array} orderData.items - Array of { productId, quantity }
     * @param {string} orderData.paymentMethod - Payment method
     * @param {string} orderData.address - Delivery address
     * @param {string} orderData.deliveryOption - pickup | delivery
     * @param {string} orderData.deliveryDate - Requested delivery date
     * @param {string} orderData.notes - Order notes
     * @returns {Promise<object|null>} Created order or null
     */
    async createOrder(orderData) {
        if (!await this.isFeatureEnabled('orderCreate')) {
            console.log('📦 Order creation feature is disabled');
            return { error: 'Order creation is not enabled in this configuration' };
        }

        try {
            const { customerPhone, items, paymentMethod, address, deliveryOption, deliveryDate, notes } = orderData;

            // Find or create customer
            let customer = await this.findCustomerByPhone(customerPhone);
            
            if (!customer) {
                return { error: 'Customer not found. They must have an account in the e-commerce system.' };
            }

            // Validate items - get product details
            const validatedItems = [];
            for (const item of items) {
                const product = await this.getProductById(item.productId);
                if (!product || !product.available) {
                    return { error: `Product ${item.productId} is not available` };
                }
                validatedItems.push({
                    product: item.productId,
                    quantity: item.quantity,
                    subtotal: product.price * item.quantity
                });
            }

            // Calculate total
            const total = validatedItems.reduce((sum, item) => sum + item.subtotal, 0);

            // Create order payload
            const orderPayload = {
                customer: customer._id,
                items: validatedItems,
                total,
                payment_method: paymentMethod || 'cash',
                address: address || '',
                deliveryOption: deliveryOption || 'delivery',
                deliveryDate: deliveryDate || null,
                status: 'pending',
                notes: notes || `Order placed via WhatsApp from ${customerPhone}`
            };

            // Send to e-commerce API
            const response = await this.makeRequest('POST', '/api/orders', orderPayload);

            if (response._id || response.orderId) {
                return this.formatOrderForCRM(response);
            }

            return { error: 'Failed to create order' };
        } catch (error) {
            console.error(`❌ Error creating order:`, error.message);
            return { error: error.message };
        }
    }

    /**
     * Get delivery options available
     * @returns {Promise<Array>} Array of delivery options
     */
    async getDeliveryOptions() {
        if (!await this.isAvailable()) {
            return [];
        }

        // These are typically hardcoded in the e-commerce system
        return [
            { id: 'pickup', label: 'Recoger en tienda', available: true },
            { id: 'delivery', label: 'Envío a domicilio', available: true }
        ];
    }

    /**
     * Get payment methods available
     * @returns {Promise<Array>} Array of payment methods
     */
    async getPaymentMethods() {
        if (!await this.isAvailable()) {
            return [];
        }

        return [
            { id: 'cash', label: 'Efectivo', available: true },
            { id: 'credit_card', label: 'Tarjeta de Crédito', available: true },
            { id: 'paypal', label: 'PayPal', available: true },
            { id: 'bank_transfer', label: 'Transferencia Bancaria', available: true }
        ];
    }

    /**
     * Update order status (if permitted by e-commerce API)
     * @param {string} orderId - Order ID
     * @param {string} newStatus - New status
     * @returns {Promise<object|null>} Updated order or null
     */
    async updateOrderStatus(orderId, newStatus) {
        if (!await this.isFeatureEnabled('orderCreate')) {
            return { error: 'Order management is not enabled' };
        }

        const validStatuses = ['pending', 'processing', 'completed', 'canceled'];
        if (!validStatuses.includes(newStatus)) {
            return { error: `Invalid status. Must be one of: ${validStatuses.join(', ')}` };
        }

        try {
            const response = await this.makeRequest('PUT', `/api/orders/${orderId}`, {
                status: newStatus
            });

            if (response._id || response.orderId) {
                return this.formatOrderForCRM(response);
            }

            return { error: 'Failed to update order status' };
        } catch (error) {
            console.error(`❌ Error updating order ${orderId}:`, error.message);
            return { error: error.message };
        }
    }

    // ============================================
    // DATA FORMATTING FOR CRM
    // ============================================

    /**
     * Format order data for CRM display
     * @param {object} order - Raw order from e-commerce API
     * @returns {object} Formatted order
     */
    formatOrderForCRM(order) {
        const statusLabels = {
            'pending': 'Pendiente',
            'processing': 'En Proceso',
            'completed': 'Completado',
            'canceled': 'Cancelado'
        };

        const paymentLabels = {
            'cash': 'Efectivo',
            'credit_card': 'Tarjeta de Crédito',
            'paypal': 'PayPal',
            'bank_transfer': 'Transferencia'
        };

        return {
            id: order._id,
            orderId: order.orderId,
            customer: {
                id: order.customer?._id || order.customer,
                name: order.customer?.name || 'N/A',
                email: order.customer?.email || 'N/A',
                phone: order.customer?.phone || 'N/A'
            },
            items: (order.items || []).map(item => ({
                productId: item.product?._id || item.product,
                productName: item.product?.name || 'Producto',
                quantity: item.quantity,
                subtotal: item.subtotal,
                discount: item.discount || 0
            })),
            total: order.total,
            status: order.status,
            statusLabel: statusLabels[order.status] || order.status,
            paymentMethod: order.payment_method,
            paymentMethodLabel: paymentLabels[order.payment_method] || order.payment_method,
            address: order.address,
            deliveryDate: order.deliveryDate,
            createdAt: order.createdAt,
            updatedAt: order.updatedAt,
            // Summary text for AI assistant
            summary: this.generateOrderSummary(order, statusLabels, paymentLabels)
        };
    }

    /**
     * Generate human-readable order summary for AI
     * @param {object} order - Order object
     * @param {object} statusLabels - Status translations
     * @param {object} paymentLabels - Payment method translations
     * @returns {string} Summary text
     */
    generateOrderSummary(order, statusLabels, paymentLabels) {
        const itemCount = order.items?.length || 0;
        const date = order.createdAt ? new Date(order.createdAt).toLocaleDateString('es-MX') : 'N/A';
        
        return `Pedido ${order.orderId || order._id}: ${itemCount} producto(s), Total: $${order.total?.toFixed(2) || 0}, ` +
               `Estado: ${statusLabels[order.status] || order.status}, ` +
               `Pago: ${paymentLabels[order.payment_method] || order.payment_method}, ` +
               `Fecha: ${date}`;
    }

    /**
     * Format product data for CRM display
     * @param {object} product - Raw product from e-commerce API
     * @returns {object} Formatted product
     */
    formatProductForCRM(product) {
        return {
            id: product._id,
            name: product.name,
            description: product.description,
            price: product.price,
            category: product.category?.name || 'Sin categoría',
            categoryId: product.category?._id || product.category,
            image: product.image,
            available: product.status !== false && !product.deleted,
            // Summary for AI
            summary: `${product.name} - $${product.price?.toFixed(2) || 0} (${product.category?.name || 'Sin categoría'})`
        };
    }

    // ============================================
    // CACHE MANAGEMENT
    // ============================================

    getFromCache(key) {
        const cached = this.cache.get(key);
        if (cached && Date.now() < cached.expiry) {
            return cached.data;
        }
        this.cache.delete(key);
        return null;
    }

    setCache(key, data, ttl = this.cacheTTL) {
        this.cache.set(key, {
            data,
            expiry: Date.now() + ttl
        });
    }

    clearCache() {
        this.cache.clear();
    }

    // ============================================
    // HEALTH CHECK
    // ============================================

    /**
     * Check if e-commerce API is reachable
     * @returns {Promise<boolean>} True if healthy
     */
    async healthCheck() {
        try {
            const response = await axios.get(`${this.baseUrl}/health`, { timeout: 5000 });
            return response.data?.status === 'healthy';
        } catch (error) {
            console.error('❌ E-commerce API health check failed:', error.message);
            return false;
        }
    }
}

// Singleton instance
const ecommerceIntegrationService = new EcommerceIntegrationService();

module.exports = ecommerceIntegrationService;
