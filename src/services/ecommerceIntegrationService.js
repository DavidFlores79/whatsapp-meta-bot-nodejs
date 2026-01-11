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
            // Search by orderId using /api/orders/search endpoint
            const response = await this.makeRequest('GET', '/api/orders/search', null, {
                search_type: 'order_id',
                search_value: orderId,
                include_items: true
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
     * Get order by MongoDB _id
     * @param {string} mongoId - The MongoDB ObjectId
     * @returns {Promise<object|null>} Order object or null if not found
     */
    async getOrderByMongoId(mongoId) {
        if (!await this.isFeatureEnabled('orderLookup')) {
            console.log('📦 Order lookup feature is disabled');
            return null;
        }

        try {
            // Fetch order directly by MongoDB ID using /api/orders/:id endpoint
            const response = await this.makeRequest('GET', `/api/orders/${mongoId}`, null, {
                include_items: true
            });

            if (response.data) {
                return this.formatOrderForCRM(response.data);
            }

            return null;
        } catch (error) {
            console.error(`❌ Error fetching order by ID ${mongoId}:`, error.message);
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
            // Search orders by phone using /api/orders/search endpoint
            const response = await this.makeRequest('GET', '/api/orders/search', null, {
                search_type: 'phone',
                search_value: phoneNumber,
                include_items: true,
                limit: limit
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
            // Search orders by email using /api/orders/search endpoint
            const response = await this.makeRequest('GET', '/api/orders/search', null, {
                search_type: 'email',
                search_value: email,
                include_items: true,
                limit: limit
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
            // Get active orders directly using /api/orders/active/:phone endpoint
            const response = await this.makeRequest('GET', `/api/orders/active/${encodeURIComponent(phoneNumber)}`);

            if (response.data && response.data.length > 0) {
                return response.data.map(order => this.formatOrderForCRM(order));
            }

            return [];
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
            // Use /api/users/by-phone/:phone endpoint
            const response = await this.makeRequest('GET', `/api/users/by-phone/${encodeURIComponent(phoneNumber)}`);

            if (response.data) {
                const customer = response.data;
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
            // Use /api/users/:phone/profile endpoint for customer profile with stats
            const response = await this.makeRequest('GET', `/api/users/${encodeURIComponent(phoneNumber)}/profile`);

            if (response.data) {
                return response.data;
            }

            // Fallback: build profile manually if endpoint returns no data
            const customer = await this.findCustomerByPhone(phoneNumber);
            if (!customer) return null;

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
            // Use /api/products endpoint with ?search= query param
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
     * Check if a string looks like a MongoDB ObjectId
     * @param {string} str - String to check
     * @returns {boolean} True if it looks like an ObjectId
     */
    isValidObjectId(str) {
        return /^[0-9a-fA-F]{24}$/.test(str);
    }

    /**
     * Get product details by ID or search by name as fallback
     * @param {string} productId - Product ID or product name
     * @returns {Promise<object|null>} Product object or null
     */
    async getProductById(productId) {
        if (!await this.isFeatureEnabled('productSearch')) {
            return null;
        }

        try {
            // If it looks like a valid MongoDB ObjectId, try direct fetch
            if (this.isValidObjectId(productId)) {
                const response = await this.makeRequest('GET', `/api/products/${productId}`);

                // E-commerce API wraps response in { message: "...", data: {...} }
                const productData = response.data || response;

                console.log(`📦 Fetched product ${productId} from API:`, {
                    name: productData.name,
                    price: productData.price,
                    _id: productData._id,
                    hasPrice: productData.price !== undefined && productData.price !== null
                });
                return this.formatProductForCRM(productData);
            }

            // Otherwise, the AI passed a product name - search for it
            console.log(`🔍 Product ID "${productId}" is not an ObjectId, searching by name...`);
            const searchResults = await this.searchProducts(productId, 1);

            if (searchResults && searchResults.length > 0) {
                console.log(`✅ Found product by name: ${searchResults[0].name} (ID: ${searchResults[0].id}), Price: ${searchResults[0].price}`);
                return searchResults[0];
            }

            console.log(`❌ No product found matching: ${productId}`);
            return null;
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
            const { customerPhone, customerName, items, paymentMethod, address, deliveryOption, deliveryDate, notes } = orderData;

            // Validate items - get product details and calculate totals
            const validatedItems = [];
            for (const item of items) {
                const product = await this.getProductById(item.productId);
                if (!product || !product.available) {
                    return { error: `Product ${item.productId} is not available` };
                }
                // Use the actual product ID from the lookup (in case AI passed a name)
                // Make sure to use product.id (which is product._id from formatProductForCRM)
                const productId = product.id || product._id || item.productId;
                if (!productId) {
                    console.error('⚠️ Product missing ID:', product);
                    return { error: `Invalid product data for ${item.productId}` };
                }

                // Ensure price and quantity are valid numbers
                const price = parseFloat(product.price);
                const quantity = parseInt(item.quantity) || 1;

                // CRITICAL: Validate that price is a valid positive number
                if (isNaN(price) || price <= 0) {
                    console.error('⚠️ Product has invalid or missing price:', {
                        productId: item.productId,
                        productData: product,
                        parsedPrice: price
                    });
                    return { error: `Product "${product.name || item.productId}" has invalid or missing price information. Please contact support.` };
                }

                const subtotal = price * quantity;

                validatedItems.push({
                    product: productId,  // Backend expects 'product' field (singular)
                    quantity: quantity,
                    subtotal: subtotal
                });
            }

            // Calculate total - ensure it's a valid number
            const total = validatedItems.reduce((sum, item) => sum + (item.subtotal || 0), 0);

            // CRITICAL: Validate that total is greater than zero
            if (total <= 0) {
                console.error('⚠️ Order total is zero or negative:', {
                    total,
                    validatedItems,
                    originalItems: items
                });
                return { error: 'Order total cannot be zero. Please ensure all products have valid prices.' };
            }

            // Find the correct delivery option ObjectId
            const deliveryOptionId = await this.findDeliveryOptionId(deliveryOption || 'delivery');
            if (!deliveryOptionId) {
                return { error: 'No delivery options available. Please contact support.' };
            }

            // Create order payload using customerPhone (API will find or create customer)
            const orderPayload = {
                customerPhone: customerPhone,
                customerName: customerName || `WhatsApp Customer`,
                items: validatedItems,
                total,
                payment_method: paymentMethod || 'cash',
                address: address || '',
                deliveryOption: deliveryOptionId,
                deliveryDate: deliveryDate || null,
                status: 'pending',
                notes: notes || `Order placed via WhatsApp from ${customerPhone}`
            };

            console.log('📦 Creating order with payload:', JSON.stringify(orderPayload, null, 2));

            // Send to e-commerce API
            const response = await this.makeRequest('POST', '/api/orders', orderPayload);

            // Check if response indicates success - handle both direct response and wrapped response
            if (response.success === false) {
                return { error: response.message || response.error || 'Failed to create order' };
            }

            // Extract order data - it might be in response.data or directly in response
            const createdOrder = response.data || response;

            if (createdOrder._id || createdOrder.orderId) {
                return this.formatOrderForCRM(createdOrder);
            }

            return { error: response.message || 'Failed to create order' };
        } catch (error) {
            console.error(`❌ Error creating order:`, error.message);
            return { error: error.message };
        }
    }

    /**
     * Get delivery options from e-commerce API
     * @returns {Promise<Array>} Array of delivery options with _id
     */
    async getDeliveryOptions() {
        if (!await this.isAvailable()) {
            return [];
        }

        try {
            const response = await this.makeRequest('GET', '/api/delivery-options');
            if (response.data && response.data.length > 0) {
                return response.data.map(option => ({
                    _id: option._id,
                    name: option.name,
                    description: option.description,
                    price: option.price || 0,
                    available: option.isActive !== false
                }));
            }
            return [];
        } catch (error) {
            console.error(`❌ Error fetching delivery options:`, error.message);
            return [];
        }
    }

    /**
     * Find delivery option ID by type (pickup/delivery)
     * @param {string} optionType - 'pickup' or 'delivery'
     * @returns {Promise<string|null>} Delivery option ObjectId or null
     */
    async findDeliveryOptionId(optionType) {
        const options = await this.getDeliveryOptions();
        if (options.length === 0) {
            return null;
        }

        // Try to match by name (case-insensitive)
        const searchTerms = {
            'pickup': ['pickup', 'recoger', 'tienda', 'store', 'local'],
            'delivery': ['delivery', 'envío', 'envio', 'domicilio', 'home', 'entrega']
        };

        const terms = searchTerms[optionType] || searchTerms['delivery'];

        for (const option of options) {
            const nameLower = (option.name || '').toLowerCase();
            const descLower = (option.description || '').toLowerCase();

            for (const term of terms) {
                if (nameLower.includes(term) || descLower.includes(term)) {
                    return option._id;
                }
            }
        }

        // If no match found, return first available option
        return options[0]?._id || null;
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
        if (!await this.isAvailable()) {
            return false;
        }
        
        try {
            const response = await axios.get(`${this.config.baseUrl}/health`, { timeout: 5000 });
            return response.status === 200;
        } catch (error) {
            console.error('❌ E-commerce API health check failed:', error.message);
            return false;
        }
    }

    // ============================================
    // REFERENCE DATA
    // ============================================

    /**
     * Get available delivery options
     * @returns {Promise<Array>} Array of delivery options
     */
    async getDeliveryOptions() {
        if (!await this.isAvailable()) {
            return [];
        }

        const cacheKey = 'delivery_options';
        const cached = this.getFromCache(cacheKey);
        if (cached) return cached;

        try {
            const response = await this.makeRequest('GET', '/api/delivery-options');
            if (response.data) {
                this.setCache(cacheKey, response.data, 60 * 60 * 1000); // 1 hour cache
                return response.data;
            }
            return [];
        } catch (error) {
            console.error('❌ Error fetching delivery options:', error.message);
            return [];
        }
    }

    /**
     * Get available payment methods
     * @returns {Promise<Array>} Array of payment methods
     */
    async getPaymentMethods() {
        if (!await this.isAvailable()) {
            return [];
        }

        const cacheKey = 'payment_methods';
        const cached = this.getFromCache(cacheKey);
        if (cached) return cached;

        try {
            const response = await this.makeRequest('GET', '/api/payment-methods');
            if (response.data) {
                this.setCache(cacheKey, response.data, 60 * 60 * 1000); // 1 hour cache
                return response.data;
            }
            return [];
        } catch (error) {
            console.error('❌ Error fetching payment methods:', error.message);
            return [];
        }
    }
}

// Singleton instance
const ecommerceIntegrationService = new EcommerceIntegrationService();

module.exports = ecommerceIntegrationService;
