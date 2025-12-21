const SystemSettings = require('../models/SystemSettings');

class ConfigurationService {
    constructor() {
        this.cache = new Map();
        this.cacheTTL = 5 * 60 * 1000; // 5 minutes
    }

    /**
     * Get ticket categories configuration
     */
    async getTicketCategories() {
        return this.getSetting('ticket_categories', this.getDefaultCategories());
    }

    /**
     * Get assistant configuration
     */
    async getAssistantConfig() {
        return this.getSetting('assistant_configuration', this.getDefaultAssistantConfig());
    }

    /**
     * Get ticket terminology
     */
    async getTicketTerminology() {
        return this.getSetting('ticket_terminology', this.getDefaultTerminology());
    }

    /**
     * Get ticket ID format configuration
     */
    async getTicketIdFormat() {
        return this.getSetting('ticket_id_format', this.getDefaultIdFormat());
    }

    /**
     * Get assistant instructions template
     */
    async getInstructionsTemplate() {
        return this.getSetting('assistant_instructions_template', this.getDefaultInstructionsTemplate());
    }

    /**
     * Get configuration presets
     */
    async getConfigurationPresets() {
        return this.getSetting('configuration_presets', this.getDefaultPresets());
    }

    /**
     * Generic method to get setting with caching
     */
    async getSetting(key, defaultValue) {
        // Check cache
        const cached = this.cache.get(key);
        if (cached && Date.now() - cached.timestamp < this.cacheTTL) {
            return cached.value;
        }

        // Fetch from DB
        const value = await SystemSettings.getSetting(key, defaultValue);

        // Update cache
        this.cache.set(key, { value, timestamp: Date.now() });
        return value;
    }

    /**
     * Update setting and invalidate cache
     */
    async updateSetting(key, value, updatedBy = null) {
        const setting = await SystemSettings.updateSetting(key, value, updatedBy);

        // Invalidate cache
        this.cache.delete(key);

        return setting;
    }

    /**
     * Invalidate cache for specific key
     */
    invalidateCache(key) {
        this.cache.delete(key);
    }

    /**
     * Clear all cache
     */
    clearCache() {
        this.cache.clear();
    }

    // ============================================
    // DEFAULT CONFIGURATIONS (LUXFREE)
    // ============================================

    getDefaultCategories() {
        return [
            {
                id: 'solar_installation',
                label: 'Instalación Solar',
                labelEn: 'Solar Installation',
                icon: 'sun',
                color: '#F59E0B',
                description: 'Instalación de paneles solares y sistemas fotovoltaicos'
            },
            {
                id: 'light_malfunction',
                label: 'Falla de Luminaria',
                labelEn: 'Light Malfunction',
                icon: 'lightbulb-off',
                color: '#EF4444',
                description: 'Problemas con luminarias o alumbrado público'
            },
            {
                id: 'maintenance',
                label: 'Mantenimiento',
                labelEn: 'Maintenance',
                icon: 'wrench',
                color: '#10B981',
                description: 'Mantenimiento preventivo o correctivo'
            },
            {
                id: 'electrical_issue',
                label: 'Problema Eléctrico',
                labelEn: 'Electrical Issue',
                icon: 'zap',
                color: '#DC2626',
                description: 'Fallas eléctricas, cortocircuitos o problemas de instalación'
            },
            {
                id: 'billing',
                label: 'Facturación',
                labelEn: 'Billing',
                icon: 'dollar-sign',
                color: '#6366F1',
                description: 'Consultas sobre pagos, facturas o presupuestos'
            },
            {
                id: 'other',
                label: 'Otro',
                labelEn: 'Other',
                icon: 'more-horizontal',
                color: '#9CA3AF',
                description: 'Otros temas no clasificados'
            }
        ];
    }

    getDefaultAssistantConfig() {
        return {
            assistantName: 'Lúmen',
            companyName: process.env.COMPANY_NAME || 'LUXFREE',
            primaryServiceIssue: 'instalaciones solares, luminarias y servicios eléctricos',
            serviceType: 'instalación y mantenimiento eléctrico',
            ticketNoun: 'reporte',
            ticketNounPlural: 'reportes',
            greetingMessage: 'Hola, soy {assistantName}, el asistente virtual de {companyName}. Estoy aquí para ayudarte con {primaryServiceIssue}.',
            language: 'es'
        };
    }

    getDefaultTerminology() {
        return {
            ticketSingular: 'reporte',
            ticketPlural: 'reportes',
            createVerb: 'reportar',
            customerNoun: 'usuario',
            agentNoun: 'agente',
            resolveVerb: 'resolver'
        };
    }

    getDefaultIdFormat() {
        return {
            prefix: 'LUX',
            includeYear: true,
            padLength: 6,
            separator: '-'
        };
    }

    getDefaultInstructionsTemplate() {
        return `Eres {assistantName}, el asistente virtual de {companyName}.

Tu función es ayudar a los usuarios con {primaryServiceIssue}.

Puedes:
1. Crear {ticketNounPlural} cuando un usuario reporte un problema o solicite servicio
2. Consultar información sobre {ticketNounPlural} existentes
3. Conectar al usuario con un {agentNoun} humano si es necesario

Siempre sé amable, profesional y claro en tus respuestas.`;
    }

    getDefaultPresets() {
        return [
            {
                id: 'luxfree',
                name: 'LUXFREE (Solar & Lighting)',
                description: 'Configuración para empresa de instalación solar y mantenimiento de luminarias',
                config: {
                    assistant_configuration: this.getDefaultAssistantConfig(),
                    ticket_categories: this.getDefaultCategories(),
                    ticket_terminology: this.getDefaultTerminology(),
                    ticket_id_format: this.getDefaultIdFormat()
                }
            },
            {
                id: 'restaurant',
                name: 'Restaurant / Food Service',
                description: 'Configuración para restaurantes y servicios de comida',
                config: {
                    assistant_configuration: {
                        assistantName: 'FoodBot',
                        companyName: 'Restaurante',
                        primaryServiceIssue: 'problemas con pedidos, entregas o calidad',
                        serviceType: 'servicio de comida',
                        ticketNoun: 'caso',
                        ticketNounPlural: 'casos',
                        language: 'es'
                    },
                    ticket_categories: [
                        { id: 'order_issue', label: 'Problema con Pedido', icon: 'shopping-bag', color: '#EF4444' },
                        { id: 'delivery_issue', label: 'Problema de Entrega', icon: 'truck', color: '#F59E0B' },
                        { id: 'food_quality', label: 'Calidad de Comida', icon: 'alert-circle', color: '#DC2626' },
                        { id: 'menu_question', label: 'Consulta de Menú', icon: 'book-open', color: '#3B82F6' },
                        { id: 'billing', label: 'Facturación', icon: 'credit-card', color: '#10B981' },
                        { id: 'other', label: 'Otro', icon: 'more-horizontal', color: '#9CA3AF' }
                    ],
                    ticket_terminology: {
                        ticketSingular: 'caso',
                        ticketPlural: 'casos',
                        createVerb: 'crear',
                        customerNoun: 'cliente',
                        agentNoun: 'agente',
                        resolveVerb: 'resolver'
                    },
                    ticket_id_format: {
                        prefix: 'FOOD',
                        includeYear: false,
                        padLength: 6,
                        separator: '-'
                    }
                }
            },
            {
                id: 'ecommerce',
                name: 'E-commerce / Retail',
                description: 'Configuración para tiendas en línea y retail',
                config: {
                    assistant_configuration: {
                        assistantName: 'ShopAssist',
                        companyName: 'TiendaOnline',
                        primaryServiceIssue: 'problemas con productos, envíos o devoluciones',
                        serviceType: 'compras en línea',
                        ticketNoun: 'solicitud',
                        ticketNounPlural: 'solicitudes',
                        language: 'es'
                    },
                    ticket_categories: [
                        { id: 'product_inquiry', label: 'Consulta de Producto', icon: 'package', color: '#3B82F6' },
                        { id: 'return_exchange', label: 'Devolución/Cambio', icon: 'repeat', color: '#F59E0B' },
                        { id: 'shipping_issue', label: 'Problema de Envío', icon: 'truck', color: '#EF4444' },
                        { id: 'payment_issue', label: 'Problema de Pago', icon: 'credit-card', color: '#DC2626' },
                        { id: 'product_defect', label: 'Producto Defectuoso', icon: 'alert-triangle', color: '#B91C1C' },
                        { id: 'other', label: 'Otro', icon: 'more-horizontal', color: '#9CA3AF' }
                    ],
                    ticket_terminology: {
                        ticketSingular: 'solicitud',
                        ticketPlural: 'solicitudes',
                        createVerb: 'crear',
                        customerNoun: 'cliente',
                        agentNoun: 'agente',
                        resolveVerb: 'completar'
                    },
                    ticket_id_format: {
                        prefix: 'ORD',
                        includeYear: true,
                        padLength: 6,
                        separator: '-'
                    }
                }
            },
            {
                id: 'healthcare',
                name: 'Healthcare / Medical',
                description: 'Configuración para clínicas y servicios médicos',
                config: {
                    assistant_configuration: {
                        assistantName: 'MediAssist',
                        companyName: 'Clínica',
                        primaryServiceIssue: 'consultas médicas, citas o recetas',
                        serviceType: 'servicios médicos',
                        ticketNoun: 'consulta',
                        ticketNounPlural: 'consultas',
                        language: 'es'
                    },
                    ticket_categories: [
                        { id: 'appointment', label: 'Cita Médica', icon: 'calendar', color: '#3B82F6' },
                        { id: 'prescription', label: 'Receta Médica', icon: 'file-text', color: '#10B981' },
                        { id: 'test_results', label: 'Resultados de Estudios', icon: 'activity', color: '#8B5CF6' },
                        { id: 'billing_insurance', label: 'Facturación/Seguro', icon: 'shield', color: '#F59E0B' },
                        { id: 'general_inquiry', label: 'Consulta General', icon: 'help-circle', color: '#6B7280' },
                        { id: 'other', label: 'Otro', icon: 'more-horizontal', color: '#9CA3AF' }
                    ],
                    ticket_terminology: {
                        ticketSingular: 'consulta',
                        ticketPlural: 'consultas',
                        createVerb: 'abrir',
                        customerNoun: 'paciente',
                        agentNoun: 'médico',
                        resolveVerb: 'cerrar'
                    },
                    ticket_id_format: {
                        prefix: 'MED',
                        includeYear: true,
                        padLength: 6,
                        separator: '-'
                    }
                }
            }
        ];
    }
}

module.exports = new ConfigurationService();
