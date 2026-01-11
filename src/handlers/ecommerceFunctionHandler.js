/**
 * E-commerce OpenAI Function Handler
 * 
 * Handles OpenAI Assistant function calls for e-commerce integration
 * Bridges the AI assistant with the e-commerce API
 * 
 * IMPORTANT: Functions are only available when the active preset
 * is compatible with e-commerce (ecommerce, restaurant)
 * 
 * @module handlers/ecommerceFunctionHandler
 */

const ecommerceService = require('../services/ecommerceIntegrationService');

/**
 * Check if e-commerce integration is available
 * @returns {Promise<object|null>} Error response if not available, null if available
 */
async function checkAvailability() {
    const available = await ecommerceService.isAvailable();
    if (!available) {
        const status = await ecommerceService.getStatus();
        return {
            success: false,
            available: false,
            error: 'La integración con la tienda en línea no está disponible en este momento.',
            reason: status.reason || 'Integration disabled'
        };
    }
    return null;
}

/**
 * Handle get_ecommerce_order function call from OpenAI
 * @param {object} args - Function arguments from OpenAI
 * @param {string} args.search_type - 'order_id', 'phone', or 'email'
 * @param {string} args.search_value - The value to search for
 * @param {boolean} args.include_items - Whether to include order items
 * @returns {Promise<object>} Result object with order data
 */
async function handleGetEcommerceOrder(args) {
    // Check availability first
    const unavailable = await checkAvailability();
    if (unavailable) return unavailable;

    const { search_type, search_value, include_items = true } = args;

    try {
        let orders = [];

        switch (search_type) {
            case 'order_id':
                const order = await ecommerceService.getOrderById(search_value);
                if (order) {
                    orders = [order];
                }
                break;

            case 'phone':
                orders = await ecommerceService.getOrdersByPhone(search_value, 5);
                break;

            case 'email':
                orders = await ecommerceService.getOrdersByEmail(search_value, 5);
                break;

            default:
                return {
                    success: false,
                    error: `Invalid search_type: ${search_type}. Use 'order_id', 'phone', or 'email'.`
                };
        }

        if (orders.length === 0) {
            return {
                success: true,
                found: false,
                message: getNotFoundMessage(search_type, search_value),
                orders: []
            };
        }

        // Format orders for AI response
        const formattedOrders = orders.map(order => {
            const result = {
                orderId: order.orderId,
                status: order.statusLabel,
                total: `$${order.total?.toFixed(2) || 0}`,
                paymentMethod: order.paymentMethodLabel,
                address: order.address || 'No especificada',
                deliveryDate: order.deliveryDate 
                    ? new Date(order.deliveryDate).toLocaleDateString('es-MX', { 
                        weekday: 'long', 
                        year: 'numeric', 
                        month: 'long', 
                        day: 'numeric' 
                    })
                    : 'Por confirmar',
                createdAt: new Date(order.createdAt).toLocaleDateString('es-MX'),
                customerName: order.customer?.name || 'N/A'
            };

            if (include_items && order.items) {
                result.items = order.items.map(item => ({
                    product: item.productName,
                    quantity: item.quantity,
                    subtotal: `$${item.subtotal?.toFixed(2) || 0}`
                }));
                result.itemCount = order.items.length;
            }

            return result;
        });

        return {
            success: true,
            found: true,
            orderCount: formattedOrders.length,
            orders: formattedOrders,
            summary: formattedOrders.length === 1 
                ? `Encontré el pedido ${formattedOrders[0].orderId} con estado: ${formattedOrders[0].status}`
                : `Encontré ${formattedOrders.length} pedidos asociados a ${search_type === 'phone' ? 'este teléfono' : 'este correo'}`
        };

    } catch (error) {
        console.error('❌ Error in handleGetEcommerceOrder:', error);
        return {
            success: false,
            error: 'Error al consultar el sistema de pedidos. Por favor intenta más tarde.'
        };
    }
}

/**
 * Handle search_ecommerce_products function call from OpenAI
 * @param {object} args - Function arguments from OpenAI
 * @param {string} args.query - Search query
 * @param {number} args.limit - Max results
 * @returns {Promise<object>} Result object with product data
 */
async function handleSearchProducts(args) {
    // Check availability first
    const unavailable = await checkAvailability();
    if (unavailable) return unavailable;

    const { query, limit = 5 } = args;

    try {
        const products = await ecommerceService.searchProducts(query, Math.min(limit, 10));

        if (products.length === 0) {
            return {
                success: true,
                found: false,
                message: `No encontré productos que coincidan con "${query}".`,
                products: []
            };
        }

        const formattedProducts = products.map(product => ({
            name: product.name,
            price: `$${product.price?.toFixed(2) || 0}`,
            category: product.category,
            available: product.available ? 'Disponible' : 'No disponible',
            description: product.description?.substring(0, 100) || 'Sin descripción'
        }));

        return {
            success: true,
            found: true,
            productCount: formattedProducts.length,
            products: formattedProducts,
            summary: `Encontré ${formattedProducts.length} producto(s) relacionados con "${query}"`
        };

    } catch (error) {
        console.error('❌ Error in handleSearchProducts:', error);
        return {
            success: false,
            error: 'Error al buscar productos. Por favor intenta más tarde.'
        };
    }
}

/**
 * Get appropriate not-found message based on search type
 */
function getNotFoundMessage(searchType, searchValue) {
    switch (searchType) {
        case 'order_id':
            return `No encontré ningún pedido con el número ${searchValue}. Por favor verifica el número e intenta de nuevo.`;
        case 'phone':
            return `No encontré pedidos asociados al teléfono ${searchValue}. ¿Es posible que hayas usado otro número para tu pedido?`;
        case 'email':
            return `No encontré pedidos asociados al correo ${searchValue}. ¿Es posible que hayas usado otro correo para tu pedido?`;
        default:
            return 'No se encontraron resultados.';
    }
}

/**
 * Handle create_ecommerce_order function call from OpenAI
 * @param {object} args - Function arguments from OpenAI
 * @param {string} args.customer_phone - Customer phone number
 * @param {string} args.customer_name - Customer name (optional, for new customers)
 * @param {Array} args.items - Array of { product_id, quantity }
 * @param {string} args.payment_method - Payment method
 * @param {string} args.address - Delivery address
 * @param {string} args.delivery_option - pickup | delivery
 * @param {string} args.delivery_date - Requested delivery date
 * @param {string} args.notes - Order notes
 * @returns {Promise<object>} Result object with created order
 */
async function handleCreateOrder(args) {
    // Check availability first
    const unavailable = await checkAvailability();
    if (unavailable) return unavailable;

    const {
        customer_phone,
        customer_name = '',
        items,
        payment_method = 'cash',
        address = '',
        delivery_option = 'delivery',
        delivery_date = null,
        notes = ''
    } = args;

    try {
        // Validate required fields
        if (!customer_phone) {
            return {
                success: false,
                error: 'Se requiere el número de teléfono del cliente.'
            };
        }

        if (!items || !Array.isArray(items) || items.length === 0) {
            return {
                success: false,
                error: 'Se requiere al menos un producto en el pedido.'
            };
        }

        // Format items for the service
        const orderItems = items.map(item => ({
            productId: item.product_id,
            quantity: item.quantity || 1
        }));

        // Create the order
        const result = await ecommerceService.createOrder({
            customerPhone: customer_phone,
            customerName: customer_name,
            items: orderItems,
            paymentMethod: payment_method,
            address,
            deliveryOption: delivery_option,
            deliveryDate: delivery_date,
            notes
        });

        if (result.error) {
            return {
                success: false,
                error: result.error
            };
        }

        return {
            success: true,
            created: true,
            order: {
                orderId: result.orderId,
                status: result.statusLabel,
                total: `$${result.total?.toFixed(2) || 0}`,
                paymentMethod: result.paymentMethodLabel,
                itemCount: result.items?.length || 0,
                deliveryOption: delivery_option === 'pickup' ? 'Recoger en tienda' : 'Envío a domicilio'
            },
            message: `¡Pedido ${result.orderId} creado exitosamente! Total: $${result.total?.toFixed(2) || 0}`
        };

    } catch (error) {
        console.error('❌ Error in handleCreateOrder:', error);
        return {
            success: false,
            error: 'Error al crear el pedido. Por favor intenta más tarde.'
        };
    }
}

/**
 * Handle get_active_orders function call from OpenAI
 * @param {object} args - Function arguments from OpenAI
 * @param {string} args.phone - Customer phone number
 * @returns {Promise<object>} Result object with active orders
 */
async function handleGetActiveOrders(args) {
    // Check availability first
    const unavailable = await checkAvailability();
    if (unavailable) return unavailable;

    const { phone } = args;

    try {
        if (!phone) {
            return {
                success: false,
                error: 'Se requiere el número de teléfono del cliente.'
            };
        }

        const orders = await ecommerceService.getActiveOrders(phone);

        if (orders.length === 0) {
            return {
                success: true,
                found: false,
                message: 'No tienes pedidos activos en este momento.',
                orders: []
            };
        }

        const formattedOrders = orders.map(order => ({
            orderId: order.orderId,
            status: order.statusLabel,
            total: `$${order.total?.toFixed(2) || 0}`,
            itemCount: order.items?.length || 0,
            createdAt: new Date(order.createdAt).toLocaleDateString('es-MX')
        }));

        return {
            success: true,
            found: true,
            orderCount: formattedOrders.length,
            orders: formattedOrders,
            summary: `Tienes ${formattedOrders.length} pedido(s) activo(s).`
        };

    } catch (error) {
        console.error('❌ Error in handleGetActiveOrders:', error);
        return {
            success: false,
            error: 'Error al consultar pedidos activos. Por favor intenta más tarde.'
        };
    }
}

/**
 * Main handler that routes function calls to appropriate handlers
 * @param {string} functionName - Name of the function called
 * @param {object} args - Function arguments
 * @returns {Promise<object>} Function result
 */
async function handleEcommerceFunction(functionName, args) {
    switch (functionName) {
        case 'get_ecommerce_order':
            return handleGetEcommerceOrder(args);
        
        case 'search_ecommerce_products':
            return handleSearchProducts(args);

        case 'create_ecommerce_order':
            return handleCreateOrder(args);

        case 'get_active_orders':
            return handleGetActiveOrders(args);

        default:
            return {
                success: false,
                error: `Unknown e-commerce function: ${functionName}`
            };
    }
}

module.exports = {
    handleEcommerceFunction,
    handleGetEcommerceOrder,
    handleSearchProducts,
    handleCreateOrder,
    handleGetActiveOrders
};
