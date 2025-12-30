const ticketService = require('../services/ticketService');
const Customer = require('../models/Customer');

/**
 * Ticket Controller
 * Handles HTTP requests for ticket management
 */

/**
 * Get all tickets with filters and pagination
 */
async function getTickets(req, res) {
    try {
        const { page, limit, status, category, priority, assignedAgent, search } = req.query;

        const options = {
            page: parseInt(page) || 1,
            limit: parseInt(limit) || 20,
            status,
            category,
            priority,
            assignedAgent,
            search
        };

        const result = await ticketService.getTickets(options);

        res.json({
            success: true,
            data: result
        });
    } catch (error) {
        console.error('Error getting tickets:', error);
        res.status(500).json({
            success: false,
            error: 'Error al obtener los tickets'
        });
    }
}

/**
 * Get single ticket by ID
 */
async function getTicket(req, res) {
    try {
        const { id } = req.params;

        const ticket = await ticketService.getTicketById(id);

        if (!ticket) {
            return res.status(404).json({
                success: false,
                error: 'Ticket no encontrado'
            });
        }

        res.json({
            success: true,
            data: ticket
        });
    } catch (error) {
        console.error('Error getting ticket:', error);
        res.status(500).json({
            success: false,
            error: 'Error al obtener el ticket'
        });
    }
}

/**
 * Create new ticket (manual creation by agent)
 */
async function createTicket(req, res) {
    try {
        const { subject, description, category, priority, customerId, customerPhone, conversationId, tags, attachments, location } = req.body;

        // Resolve customerId from customerPhone if not provided
        let resolvedCustomerId = customerId;

        if (!resolvedCustomerId && customerPhone) {
            // Try to find customer by phone number
            const customer = await Customer.findOne({ phoneNumber: customerPhone });
            if (customer) {
                resolvedCustomerId = customer._id;
            } else {
                // Create a new customer with the phone number
                const newCustomer = new Customer({
                    phoneNumber: customerPhone,
                    firstName: 'Customer',
                    lastName: ''
                });
                await newCustomer.save();
                resolvedCustomerId = newCustomer._id;
            }
        }

        if (!subject || !description || !category || !resolvedCustomerId) {
            return res.status(400).json({
                success: false,
                error: 'Faltan campos requeridos: subject, description, category, customerId o customerPhone'
            });
        }

        const agentId = req.agent._id;

        const ticket = await ticketService.createTicketFromAgent({
            subject,
            description,
            category,
            priority,
            customerId: resolvedCustomerId,
            conversationId,
            tags,
            attachments,
            location
        }, agentId);

        res.status(201).json({
            success: true,
            data: ticket,
            message: 'Ticket creado exitosamente'
        });
    } catch (error) {
        console.error('Error creating ticket:', error);
        res.status(500).json({
            success: false,
            error: error.message || 'Error al crear el ticket'
        });
    }
}

/**
 * Update ticket
 */
async function updateTicket(req, res) {
    try {
        const { id } = req.params;
        const updates = req.body;

        // Don't allow updating critical fields this way
        delete updates.ticketId;
        delete updates.customerId;
        delete updates.createdAt;

        const ticket = await ticketService.updateTicket(id, updates);

        res.json({
            success: true,
            data: ticket,
            message: 'Ticket actualizado exitosamente'
        });
    } catch (error) {
        console.error('Error updating ticket:', error);
        res.status(500).json({
            success: false,
            error: error.message || 'Error al actualizar el ticket'
        });
    }
}

/**
 * Change ticket status
 */
async function changeStatus(req, res) {
    try {
        const { id } = req.params;
        const { status, reason } = req.body;

        if (!status) {
            return res.status(400).json({
                success: false,
                error: 'El campo status es requerido'
            });
        }

        const agentId = req.agent._id;

        const ticket = await ticketService.updateTicketStatus(id, status, agentId, reason);

        res.json({
            success: true,
            data: ticket,
            message: 'Estado del ticket actualizado exitosamente'
        });
    } catch (error) {
        console.error('Error changing ticket status:', error);
        res.status(500).json({
            success: false,
            error: error.message || 'Error al cambiar el estado del ticket'
        });
    }
}

/**
 * Assign ticket to agent
 */
async function assignTicket(req, res) {
    try {
        const { id } = req.params;
        const { agentId } = req.body;

        if (!agentId) {
            return res.status(400).json({
                success: false,
                error: 'El campo agentId es requerido'
            });
        }

        const ticket = await ticketService.assignTicket(id, agentId);

        res.json({
            success: true,
            data: ticket,
            message: 'Ticket asignado exitosamente'
        });
    } catch (error) {
        console.error('Error assigning ticket:', error);
        res.status(500).json({
            success: false,
            error: error.message || 'Error al asignar el ticket'
        });
    }
}

/**
 * Add note to ticket
 */
async function addNote(req, res) {
    try {
        const { id } = req.params;
        const { content, isInternal } = req.body;

        if (!content) {
            return res.status(400).json({
                success: false,
                error: 'El campo content es requerido'
            });
        }

        const agentId = req.agent._id;

        const ticket = await ticketService.addNote(id, content, agentId, isInternal !== false);

        res.json({
            success: true,
            data: ticket,
            message: 'Nota agregada exitosamente'
        });
    } catch (error) {
        console.error('Error adding note:', error);
        res.status(500).json({
            success: false,
            error: error.message || 'Error al agregar la nota'
        });
    }
}

/**
 * Resolve ticket
 */
async function resolveTicket(req, res) {
    try {
        const { id } = req.params;
        const { summary, steps, category } = req.body;

        if (!summary) {
            return res.status(400).json({
                success: false,
                error: 'El campo summary es requerido'
            });
        }

        const agentId = req.agent._id;

        const ticket = await ticketService.resolveTicket(id, {
            summary,
            steps,
            category
        }, agentId);

        res.json({
            success: true,
            data: ticket,
            message: 'Ticket resuelto exitosamente'
        });
    } catch (error) {
        console.error('Error resolving ticket:', error);
        res.status(500).json({
            success: false,
            error: error.message || 'Error al resolver el ticket'
        });
    }
}

/**
 * Reopen ticket
 */
async function reopenTicket(req, res) {
    try {
        const { id } = req.params;
        const { reason } = req.body;

        const ticket = await ticketService.reopenTicket(id, reason);

        res.json({
            success: true,
            data: ticket,
            message: 'Ticket reabierto exitosamente'
        });
    } catch (error) {
        console.error('Error reopening ticket:', error);
        res.status(500).json({
            success: false,
            error: error.message || 'Error al reabrir el ticket'
        });
    }
}

/**
 * Escalate ticket
 */
async function escalateTicket(req, res) {
    try {
        const { id } = req.params;
        const { toAgentId, reason } = req.body;

        if (!toAgentId || !reason) {
            return res.status(400).json({
                success: false,
                error: 'Los campos toAgentId y reason son requeridos'
            });
        }

        const ticket = await ticketService.escalateTicket(id, toAgentId, reason);

        res.json({
            success: true,
            data: ticket,
            message: 'Ticket escalado exitosamente'
        });
    } catch (error) {
        console.error('Error escalating ticket:', error);
        res.status(500).json({
            success: false,
            error: error.message || 'Error al escalar el ticket'
        });
    }
}

/**
 * Get tickets by customer ID
 */
async function getCustomerTickets(req, res) {
    try {
        const { customerId } = req.params;
        const { page, limit, status } = req.query;

        const options = {
            page: parseInt(page) || 1,
            limit: parseInt(limit) || 20,
            status
        };

        const result = await ticketService.getTicketsByCustomer(customerId, options);

        res.json({
            success: true,
            data: result
        });
    } catch (error) {
        console.error('Error getting customer tickets:', error);
        res.status(500).json({
            success: false,
            error: 'Error al obtener los tickets del cliente'
        });
    }
}

/**
 * Get tickets by conversation ID
 */
async function getConversationTickets(req, res) {
    try {
        const { conversationId } = req.params;

        const tickets = await require('../models/Ticket').find({ conversationId })
            .populate('assignedAgent', 'firstName lastName')
            .sort({ createdAt: -1 });

        res.json({
            success: true,
            data: tickets
        });
    } catch (error) {
        console.error('Error getting conversation tickets:', error);
        res.status(500).json({
            success: false,
            error: 'Error al obtener los tickets de la conversación'
        });
    }
}

/**
 * Get ticket statistics
 */
async function getStatistics(req, res) {
    try {
        const { agentId, customerId } = req.query;

        const statistics = await ticketService.getTicketStatistics({
            agentId,
            customerId
        });

        res.json({
            success: true,
            data: statistics
        });
    } catch (error) {
        console.error('Error getting statistics:', error);
        res.status(500).json({
            success: false,
            error: 'Error al obtener las estadísticas'
        });
    }
}

/**
 * Get conversation attachments for a ticket
 */
async function getConversationAttachments(req, res) {
    try {
        const { id } = req.params;

        const attachments = await ticketService.getConversationAttachments(id);

        res.json({
            success: true,
            data: attachments
        });
    } catch (error) {
        console.error('Error getting conversation attachments:', error);
        res.status(500).json({
            success: false,
            error: 'Error al obtener adjuntos de la conversación'
        });
    }
}

/**
 * Attach a conversation message to a ticket
 */
async function attachMessageToTicket(req, res) {
    try {
        const { id } = req.params;
        const { messageId } = req.body;

        if (!messageId) {
            return res.status(400).json({
                success: false,
                error: 'messageId es requerido'
            });
        }

        const ticket = await ticketService.attachMessageToTicket(id, messageId);

        res.json({
            success: true,
            data: ticket,
            message: 'Adjunto añadido al ticket exitosamente'
        });
    } catch (error) {
        console.error('Error attaching message to ticket:', error);
        res.status(500).json({
            success: false,
            error: error.message || 'Error al añadir adjunto al ticket'
        });
    }
}

module.exports = {
    getTickets,
    getTicket,
    createTicket,
    updateTicket,
    changeStatus,
    assignTicket,
    addNote,
    resolveTicket,
    reopenTicket,
    escalateTicket,
    getCustomerTickets,
    getConversationTickets,
    getStatistics,
    getConversationAttachments,
    attachMessageToTicket
};
