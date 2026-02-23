/**
 * OpenAI Tool Definitions
 *
 * Defines the full JSON schemas for every function tool the assistant can call.
 * Only the relevant subset is passed at run-creation time (based on the active preset),
 * so the model can ONLY invoke the tools that are appropriate for the current business type.
 *
 * Preset → tool-set mapping:
 *   luxfree    → TICKET_TOOLS
 *   healthcare → HEALTHCARE_TOOLS  (clinical analysis — no tickets, no orders)
 *   restaurant → ECOMMERCE_TOOLS   (food ordering — no tickets)
 *   ecommerce  → ECOMMERCE_TOOLS + TICKET_TOOLS
 */

// ─────────────────────────────────────────────
// Ticket / Support Tools
// ─────────────────────────────────────────────

const TICKET_TOOLS = [
    {
        type: 'function',
        name: 'create_ticket_report',
        description: 'Creates a support ticket/report after the customer explicitly confirms the collected information. ONLY call this once the customer has confirmed with CONFIRM or CONFIRMAR.',
        parameters: {
            type: 'object',
            properties: {
                subject: {
                    type: 'string',
                    description: 'Brief subject / title of the issue (5–15 words)'
                },
                description: {
                    type: 'string',
                    description: 'Full description of the issue as reported by the customer'
                },
                category: {
                    type: 'string',
                    description: 'Issue category id matching one of the configured categories. Use "other" as fallback.'
                },
                priority: {
                    type: 'string',
                    enum: ['low', 'medium', 'high', 'urgent'],
                    description: 'Ticket priority. Default: medium'
                },
                location: {
                    type: 'string',
                    description: 'GPS coordinates, formatted address, or description of the location (optional)'
                }
            },
            required: ['subject', 'description']
        }
    },
    {
        type: 'function',
        name: 'get_ticket_information',
        description: 'Retrieves ticket information for the customer. ONLY call after the customer has confirmed the phone number or ticket ID to search. Customers can only access their own tickets.',
        parameters: {
            type: 'object',
            properties: {
                ticket_id: {
                    type: 'string',
                    description: 'Specific ticket ID to look up (e.g. LUX-2025-000042)'
                },
                phone_number: {
                    type: 'string',
                    description: 'Phone number to search tickets for. Defaults to the current customer\'s number.'
                },
                lookup_recent: {
                    type: 'boolean',
                    description: 'Set to true to list the customer\'s most recent tickets instead of looking up a specific one'
                },
                limit: {
                    type: 'number',
                    description: 'Maximum number of tickets to return when lookup_recent is true (default: 5, max: 10)'
                },
                status: {
                    type: 'string',
                    description: 'Filter results by ticket status (e.g. open, in_progress, resolved)'
                },
                exclude_closed: {
                    type: 'boolean',
                    description: 'When true, closed tickets are excluded from the results'
                },
                include_notes: {
                    type: 'boolean',
                    description: 'When true, external (customer-visible) notes are included in the response'
                }
            },
            required: []
        }
    }
];

// ─────────────────────────────────────────────
// E-Commerce / Order Tools
// ─────────────────────────────────────────────

const ECOMMERCE_TOOLS = [
    {
        type: 'function',
        name: 'search_ecommerce_products',
        description: 'Searches the product/menu catalog. Use this BEFORE creating an order to get the correct product_id.',
        parameters: {
            type: 'object',
            properties: {
                query: {
                    type: 'string',
                    description: 'Search term (product name, category, keyword)'
                },
                limit: {
                    type: 'number',
                    description: 'Maximum number of results to return (default: 5, max: 10)'
                }
            },
            required: ['query']
        }
    },
    {
        type: 'function',
        description: 'Creates a purchase/food order after the customer explicitly confirms the order summary with CONFIRM or CONFIRMAR. Always search for products first to obtain the correct product_id.',
        parameters: {
            type: 'object',
            properties: {
                customer_phone: {
                    type: 'string',
                    description: 'Customer\'s WhatsApp phone number'
                },
                customer_name: {
                    type: 'string',
                    description: 'Customer name (optional if already on file)'
                },
                items: {
                    type: 'array',
                    description: 'List of products/items to order',
                    items: {
                        type: 'object',
                        properties: {
                            product_id: {
                                type: 'string',
                                description: 'MongoDB ObjectId returned by search_ecommerce_products — NOT the product name'
                            },
                            quantity: {
                                type: 'number',
                                description: 'Quantity to order'
                            }
                        },
                        required: ['product_id', 'quantity']
                    }
                },
                payment_method: {
                    type: 'string',
                    enum: ['cash', 'card', 'transfer', 'paypal'],
                    description: 'Payment method. Default: cash'
                },
                address: {
                    type: 'string',
                    description: 'Delivery address (required when delivery_option is "delivery")'
                },
                delivery_option: {
                    type: 'string',
                    enum: ['delivery', 'pickup'],
                    description: 'Whether to deliver or have the customer pick up. Default: delivery'
                },
                delivery_date: {
                    type: 'string',
                    description: 'Requested delivery/pickup date and time (ISO 8601 or natural language)'
                },
                notes: {
                    type: 'string',
                    description: 'Special instructions or notes for the order (allergies, preferences, etc.)'
                }
            },
            required: ['customer_phone', 'items']
        }
    },
    {
        type: 'function',
        name: 'get_ecommerce_order',
        description: 'Looks up one or more orders by order ID, phone number, or email address.',
        parameters: {
            type: 'object',
            properties: {
                search_type: {
                    type: 'string',
                    enum: ['order_id', 'phone', 'email'],
                    description: 'How to search for the order'
                },
                search_value: {
                    type: 'string',
                    description: 'The order ID, phone number, or email to search for'
                },
                include_items: {
                    type: 'boolean',
                    description: 'Whether to include the list of items in each order (default: true)'
                }
            },
            required: ['search_type', 'search_value']
        }
    },
    {
        type: 'function',
        name: 'get_active_orders',
        description: 'Returns all pending or in-progress orders for a customer phone number.',
        parameters: {
            type: 'object',
            properties: {
                phone: {
                    type: 'string',
                    description: 'Customer\'s phone number'
                }
            },
            required: ['phone']
        }
    }
];

// ─────────────────────────────────────────────
// Healthcare / Clinical Analysis Tools
// ─────────────────────────────────────────────

const HEALTHCARE_TOOLS = [
    {
        type: 'function',
        name: 'create_clinical_analysis_request',
        description: 'Registers a new clinical analysis request (blood test, urine test, stool test, culture, etc.) after the patient explicitly confirms the details with CONFIRM or CONFIRMAR. NEVER call without confirmation.',
        parameters: {
            type: 'object',
            properties: {
                patient_name: {
                    type: 'string',
                    description: 'Full name of the patient'
                },
                patient_phone: {
                    type: 'string',
                    description: 'Patient WhatsApp phone number (used for lookup and result notifications)'
                },
                date_of_birth: {
                    type: 'string',
                    description: 'Patient date of birth for identification, format DD/MM/YYYY (optional but recommended)'
                },
                analysis_types: {
                    type: 'array',
                    items: { type: 'string' },
                    description: 'List of requested analyses. Use standardized ids: blood_count, glucose, liver_panel, kidney_panel, thyroid_panel, lipid_panel, urine_general, urine_culture, stool_general, stool_culture, pregnancy_test, hba1c, covid_pcr, covid_antigen, other'
                },
                doctor_name: {
                    type: 'string',
                    description: 'Name of the referring doctor or specialist (optional)'
                },
                preparation_notes: {
                    type: 'string',
                    description: 'Any known preparation requirements mentioned by the patient, e.g. fasting hours, medications to hold (optional)'
                },
                preferred_date: {
                    type: 'string',
                    description: 'Preferred date for sample collection, format DD/MM/YYYY (optional)'
                }
            },
            required: ['patient_name', 'patient_phone', 'analysis_types']
        }
    },
    {
        type: 'function',
        name: 'get_clinical_analysis_results',
        description: 'Retrieves the status or results of a clinical analysis request for a patient. ONLY call after the patient confirms the reference number or phone number to search. NEVER interpret or explain the result values — only report them and recommend consulting a doctor.',
        parameters: {
            type: 'object',
            properties: {
                reference_number: {
                    type: 'string',
                    description: 'Clinical analysis reference number (e.g. CLN-2025-000042)'
                },
                patient_phone: {
                    type: 'string',
                    description: 'Patient phone number to look up analyses by — defaults to the current user\'s number'
                },
                lookup_recent: {
                    type: 'boolean',
                    description: 'Set to true to list recent analysis requests for the patient instead of a specific one'
                },
                include_results: {
                    type: 'boolean',
                    description: 'Whether to include result values when available (default: false — returns status only)'
                }
            },
            required: []
        }
    }
];

// ─────────────────────────────────────────────
// Preset → Tool Set Mapping
// ─────────────────────────────────────────────

/**
 * Returns the OpenAI tool definitions that should be passed for a given preset.
 *
 * @param {string} presetId - e.g. 'luxfree', 'restaurant', 'ecommerce', 'healthcare'
 * @returns {Array} Array of OpenAI tool definition objects
 */
function getToolsForPreset(presetId) {
    switch ((presetId || 'luxfree').toLowerCase()) {
        case 'restaurant':
            // Food ordering only — no tickets, no clinical tools
            return [...ECOMMERCE_TOOLS];

        case 'ecommerce':
            // Full commerce + complaint tickets
            return [...ECOMMERCE_TOOLS, ...TICKET_TOOLS];

        case 'healthcare':
            // Clinical analysis tools only — no tickets, no orders
            return [...HEALTHCARE_TOOLS];

        case 'luxfree':
        default:
            // Support ticket system only — no orders, no clinical tools
            return [...TICKET_TOOLS];
    }
}

module.exports = {
    TICKET_TOOLS,
    ECOMMERCE_TOOLS,
    HEALTHCARE_TOOLS,
    getToolsForPreset
};
