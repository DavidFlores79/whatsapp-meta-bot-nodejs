/**
 * E-commerce Integration Configuration Model
 * 
 * Stores configuration for connecting to external e-commerce systems.
 * This allows dynamic configuration through the CRM admin panel
 * without needing to modify environment variables or restart the server.
 * 
 * @module models/EcommerceConfig
 */

const { Schema, model } = require('mongoose');

/**
 * Schema for e-commerce integration configuration
 */
const ecommerceConfigSchema = new Schema({
    // Unique identifier for the configuration
    name: {
        type: String,
        required: true,
        unique: true,
        default: 'default',
        enum: ['default'], // For now, only one config
        index: true
    },

    // Whether the integration is enabled
    enabled: {
        type: Boolean,
        default: false
    },

    // E-commerce API connection settings
    connection: {
        // Base URL of the e-commerce API
        apiUrl: {
            type: String,
            required: function() { return this.enabled; },
            trim: true
        },
        
        // Authentication type
        authType: {
            type: String,
            enum: ['jwt', 'apiKey', 'none'],
            default: 'jwt'
        },

        // Service account credentials (for JWT auth)
        serviceEmail: {
            type: String,
            trim: true
        },

        // Service account password (encrypted in practice)
        servicePassword: {
            type: String
        },

        // API Key (for apiKey auth)
        apiKey: {
            type: String
        },

        // Connection timeout in milliseconds
        timeout: {
            type: Number,
            default: 10000
        },

        // Whether to verify SSL certificates
        verifySSL: {
            type: Boolean,
            default: true
        }
    },

    // Feature flags - which features are enabled
    features: {
        // Look up order information
        orderLookup: {
            type: Boolean,
            default: true
        },

        // Create orders via WhatsApp
        orderCreate: {
            type: Boolean,
            default: false
        },

        // Search product catalog
        productSearch: {
            type: Boolean,
            default: true
        },

        // Link WhatsApp customers with e-commerce accounts
        customerLink: {
            type: Boolean,
            default: true
        },

        // Receive real-time webhooks from e-commerce
        webhooks: {
            type: Boolean,
            default: false
        },

        // Send order confirmation messages to customers
        orderNotifications: {
            type: Boolean,
            default: true
        }
    },

    // Webhook configuration (for receiving updates from e-commerce)
    webhooks: {
        // Secret for verifying webhook signatures
        secret: {
            type: String
        },

        // Events to subscribe to
        subscribedEvents: [{
            type: String,
            enum: ['order.created', 'order.updated', 'order.completed', 'order.canceled', 'product.updated']
        }]
    },

    // Mapping configuration for field names between systems
    fieldMapping: {
        // How to identify customers between systems
        customerIdentifier: {
            type: String,
            enum: ['phone', 'email', 'customerId'],
            default: 'phone'
        },

        // Phone number format in e-commerce system
        phoneFormat: {
            type: String,
            enum: ['raw', 'e164', 'local'],
            default: 'raw'
        }
    },

    // Caching settings
    cache: {
        // TTL for cached data in seconds
        ttl: {
            type: Number,
            default: 300 // 5 minutes
        },

        // Whether to cache product data
        cacheProducts: {
            type: Boolean,
            default: true
        },

        // Whether to cache customer data
        cacheCustomers: {
            type: Boolean,
            default: true
        }
    },

    // Last successful connection timestamp
    lastConnected: {
        type: Date
    },

    // Last connection error (if any)
    lastError: {
        message: String,
        timestamp: Date
    },

    // Health check status
    healthStatus: {
        type: String,
        enum: ['healthy', 'degraded', 'unhealthy', 'unknown'],
        default: 'unknown'
    }
}, {
    timestamps: true,
    collection: 'ecommerce_config'
});

/**
 * Get the default configuration
 * @returns {Promise<object>} Configuration document
 */
ecommerceConfigSchema.statics.getDefault = async function() {
    let config = await this.findOne({ name: 'default' });
    
    if (!config) {
        // Create default config from environment variables
        config = await this.create({
            name: 'default',
            enabled: !!process.env.ECOMMERCE_API_URL,
            connection: {
                apiUrl: process.env.ECOMMERCE_API_URL || '',
                authType: 'jwt',
                serviceEmail: process.env.ECOMMERCE_SERVICE_EMAIL || '',
                servicePassword: process.env.ECOMMERCE_SERVICE_PASSWORD || ''
            },
            features: {
                orderLookup: true,
                orderCreate: false,
                productSearch: true,
                customerLink: true,
                webhooks: false,
                orderNotifications: true
            }
        });
    }

    return config;
};

/**
 * Update the default configuration
 * @param {object} updates - Fields to update
 * @returns {Promise<object>} Updated configuration
 */
ecommerceConfigSchema.statics.updateDefault = async function(updates) {
    return this.findOneAndUpdate(
        { name: 'default' },
        { $set: updates },
        { new: true, upsert: true }
    );
};

/**
 * Record a successful connection
 */
ecommerceConfigSchema.methods.recordSuccess = async function() {
    this.lastConnected = new Date();
    this.healthStatus = 'healthy';
    this.lastError = undefined;
    return this.save();
};

/**
 * Record a connection error
 * @param {string} errorMessage - Error message
 */
ecommerceConfigSchema.methods.recordError = async function(errorMessage) {
    this.lastError = {
        message: errorMessage,
        timestamp: new Date()
    };
    this.healthStatus = 'unhealthy';
    return this.save();
};

const EcommerceConfig = model('EcommerceConfig', ecommerceConfigSchema);

module.exports = EcommerceConfig;
