const Ticket = require('../models/Ticket');
const TicketCounter = require('../models/TicketCounter');
const Customer = require('../models/Customer');
const configService = require('./configurationService');
const { io } = require('../models/server');
const mongoose = require('mongoose');

class TicketService {
    /**
     * Helper to find a ticket by either MongoDB _id or human-readable ticketId
     */
    async findTicketByAnyId(id) {
        // Try to find by MongoDB _id first if it's a valid ObjectId
        if (mongoose.Types.ObjectId.isValid(id)) {
            const ticket = await Ticket.findById(id);
            if (ticket) return ticket;
        }
        // Fall back to ticketId (human-readable ID)
        return await Ticket.findOne({ ticketId: id });
    }

    /**
     * Generate ticket ID based on configuration
     */
    async generateTicketId() {
        const format = await configService.getTicketIdFormat();
        const { year, sequence } = await TicketCounter.getNextSequence();

        const paddedSequence = String(sequence).padStart(format.padLength || 6, '0');

        if (format.includeYear) {
            return `${format.prefix}${format.separator}${year}${format.separator}${paddedSequence}`;
        } else {
            return `${format.prefix}${format.separator}${paddedSequence}`;
        }
    }

    /**
     * Validate category against configured categories
     */
    async validateCategory(category) {
        const categories = await configService.getTicketCategories();
        const validCategories = categories.map(c => c.id);
        return validCategories.includes(category);
    }

    /**
     * Create ticket from AI tool call
     */
    async createTicketFromAI(data) {
        const { subject, description, category, priority, location, customerId, conversationId } = data;

        // Validate category
        const isValidCategory = await this.validateCategory(category);
        if (!isValidCategory) {
            throw new Error('Categoría de ticket inválida');
        }

        // Generate ticket ID
        const ticketId = await this.generateTicketId();

        // Create ticket
        const ticket = new Ticket({
            ticketId,
            customerId,
            conversationId,
            subject,
            description,
            category,
            priority: priority || 'medium',
            location,
            status: 'new'
        });

        await ticket.save();

        // Update customer statistics
        await Customer.findByIdAndUpdate(customerId, {
            $inc: { 'statistics.totalTickets': 1 }
        });

        // Emit Socket.io event
        if (io) {
            io.emit('ticket_created', {
                ticket: await ticket.populate(['customerId', 'conversationId']),
                customerId
            });
        }

        return ticket;
    }

    /**
     * Create ticket from agent (manual creation)
     */
    async createTicketFromAgent(data, agentId) {
        const { subject, description, category, priority, customerId, conversationId, tags } = data;

        // Validate category
        const isValidCategory = await this.validateCategory(category);
        if (!isValidCategory) {
            throw new Error('Categoría de ticket inválida');
        }

        // Generate ticket ID
        const ticketId = await this.generateTicketId();

        // Create ticket
        const ticket = new Ticket({
            ticketId,
            customerId,
            conversationId,
            subject,
            description,
            category,
            priority: priority || 'medium',
            status: 'open',
            assignedAgent: agentId,
            tags
        });

        await ticket.save();

        // Update customer statistics
        await Customer.findByIdAndUpdate(customerId, {
            $inc: { 'statistics.totalTickets': 1 }
        });

        // Emit Socket.io event
        if (io) {
            io.emit('ticket_created', {
                ticket: await ticket.populate(['customerId', 'conversationId', 'assignedAgent']),
                customerId,
                agentId
            });
        }

        return ticket;
    }

    /**
     * Get ticket by ID with populated references
     * Supports both MongoDB _id and human-readable ticketId
     */
    async getTicketById(id) {
        // Try to find by MongoDB _id first if it's a valid ObjectId
        let ticket = null;
        if (mongoose.Types.ObjectId.isValid(id)) {
            ticket = await Ticket.findById(id)
                .populate('customerId', 'firstName lastName phoneNumber email')
                .populate('conversationId')
                .populate('assignedAgent', 'firstName lastName email')
                .populate('escalatedTo', 'firstName lastName email')
                .populate('notes.agent', 'firstName lastName');
        }
        
        // If not found by _id, try ticketId (human-readable ID)
        if (!ticket) {
            ticket = await Ticket.findOne({ ticketId: id })
                .populate('customerId', 'firstName lastName phoneNumber email')
                .populate('conversationId')
                .populate('assignedAgent', 'firstName lastName email')
                .populate('escalatedTo', 'firstName lastName email')
                .populate('notes.agent', 'firstName lastName');
        }

        return ticket;
    }

    /**
     * Get ticket by ID for customer (security check)
     */
    async getTicketByIdForCustomer(ticketId, customerId) {
        const ticket = await Ticket.findOne({ ticketId, customerId })
            .populate('assignedAgent', 'firstName lastName')
            .select('-notes'); // Don't expose internal notes

        return ticket;
    }

    /**
     * Get tickets by customer
     */
    async getTicketsByCustomer(customerId, options = {}) {
        const { page = 1, limit = 20, status } = options;

        const query = { customerId };
        if (status) {
            query.status = status;
        }

        const tickets = await Ticket.find(query)
            .populate('assignedAgent', 'firstName lastName')
            .sort({ createdAt: -1 })
            .limit(limit)
            .skip((page - 1) * limit);

        const total = await Ticket.countDocuments(query);

        return {
            tickets,
            total,
            page,
            pages: Math.ceil(total / limit)
        };
    }

    /**
     * Get tickets by agent
     */
    async getTicketsByAgent(agentId, options = {}) {
        const { page = 1, limit = 20, status } = options;

        const query = { assignedAgent: agentId };
        if (status) {
            query.status = status;
        }

        const tickets = await Ticket.find(query)
            .populate('customerId', 'firstName lastName phoneNumber')
            .populate('conversationId')
            .sort({ updatedAt: -1 })
            .limit(limit)
            .skip((page - 1) * limit);

        const total = await Ticket.countDocuments(query);

        return {
            tickets,
            total,
            page,
            pages: Math.ceil(total / limit)
        };
    }

    /**
     * Get all tickets with filters
     */
    async getTickets(options = {}) {
        const { page = 1, limit = 20, status, category, priority, assignedAgent, search } = options;

        const query = {};

        if (status) query.status = status;
        if (category) query.category = category;
        if (priority) query.priority = priority;
        if (assignedAgent) query.assignedAgent = assignedAgent;
        if (search) {
            query.$text = { $search: search };
        }

        const tickets = await Ticket.find(query)
            .populate('customerId', 'firstName lastName phoneNumber')
            .populate('assignedAgent', 'firstName lastName')
            .populate('conversationId')
            .sort({ updatedAt: -1 })
            .limit(limit)
            .skip((page - 1) * limit);

        const total = await Ticket.countDocuments(query);

        return {
            tickets,
            total,
            page,
            pages: Math.ceil(total / limit)
        };
    }

    /**
     * Update ticket status with history
     */
    async updateTicketStatus(ticketId, newStatus, agentId, reason = null) {
        const ticket = await this.findTicketByAnyId(ticketId);
        if (!ticket) {
            throw new Error('Ticket no encontrado');
        }

        const oldStatus = ticket.status;

        // Add to status history
        ticket.statusHistory.push({
            from: oldStatus,
            to: newStatus,
            changedBy: agentId,
            changedAt: new Date(),
            reason
        });

        ticket.status = newStatus;

        if (newStatus === 'closed') {
            ticket.closedAt = new Date();
        }

        await ticket.save();

        // Populate for Socket.io event
        const populatedTicket = await Ticket.findById(ticket._id)
            .populate('customerId', 'firstName lastName phoneNumber')
            .populate('assignedAgent', 'firstName lastName email')
            .populate('notes.agent', 'firstName lastName');

        // Emit Socket.io event with full ticket
        if (io) {
            io.emit('ticket_status_changed', {
                ticket: populatedTicket,
                previousStatus: oldStatus
            });
        }

        return populatedTicket;
    }

    /**
     * Assign ticket to agent
     */
    async assignTicket(ticketId, agentId) {
        // First find the ticket to get the correct query
        const existingTicket = await this.findTicketByAnyId(ticketId);
        if (!existingTicket) {
            throw new Error('Ticket no encontrado');
        }

        const ticket = await Ticket.findByIdAndUpdate(
            existingTicket._id,
            { assignedAgent: agentId },
            { new: true }
        ).populate('assignedAgent', 'firstName lastName email');

        // Emit Socket.io event
        if (io) {
            io.emit('ticket_assigned', {
                ticketId: ticket.ticketId,
                agentId,
                ticket
            });
        }

        return ticket;
    }

    /**
     * Add note to ticket
     */
    async addNote(ticketId, content, agentId, isInternal = true) {
        const ticket = await this.findTicketByAnyId(ticketId);
        if (!ticket) {
            throw new Error('Ticket no encontrado');
        }

        ticket.notes.push({
            agent: agentId,
            content,
            isInternal,
            timestamp: new Date()
        });

        await ticket.save();

        // Populate for Socket.io event
        const populatedTicket = await Ticket.findById(ticket._id)
            .populate('customerId', 'firstName lastName phoneNumber')
            .populate('assignedAgent', 'firstName lastName email')
            .populate('notes.agent', 'firstName lastName');

        const newNote = populatedTicket.notes[populatedTicket.notes.length - 1];

        // Emit Socket.io event with full ticket
        if (io) {
            io.emit('ticket_note_added', {
                ticket: populatedTicket,
                note: newNote
            });
        }

        return populatedTicket;
    }

    /**
     * Resolve ticket
     */
    async resolveTicket(ticketId, resolution, agentId) {
        const ticket = await this.findTicketByAnyId(ticketId);
        if (!ticket) {
            throw new Error('Ticket no encontrado');
        }

        ticket.status = 'resolved';
        ticket.resolution = {
            summary: resolution.summary,
            steps: resolution.steps || [],
            resolvedBy: agentId,
            resolvedAt: new Date(),
            resolutionCategory: resolution.category || 'solved'
        };

        // Calculate resolution time
        const createdAt = new Date(ticket.createdAt);
        const resolvedAt = new Date();
        ticket.resolutionTime = Math.floor((resolvedAt - createdAt) / (1000 * 60)); // Minutes

        await ticket.save();

        // Populate for Socket.io event
        const populatedTicket = await Ticket.findById(ticket._id)
            .populate('customerId', 'firstName lastName phoneNumber')
            .populate('assignedAgent', 'firstName lastName email')
            .populate('resolution.resolvedBy', 'firstName lastName')
            .populate('notes.agent', 'firstName lastName');

        // Emit Socket.io event with full ticket
        if (io) {
            io.emit('ticket_resolved', {
                ticket: populatedTicket
            });
        }

        return populatedTicket;
    }

    /**
     * Escalate ticket
     */
    async escalateTicket(ticketId, toAgentId, reason) {
        const ticket = await this.findTicketByAnyId(ticketId);
        if (!ticket) {
            throw new Error('Ticket no encontrado');
        }

        ticket.escalated = true;
        ticket.escalatedTo = toAgentId;
        ticket.escalatedAt = new Date();
        ticket.escalationReason = reason;

        await ticket.save();

        // Populate for Socket.io event
        const populatedTicket = await Ticket.findById(ticket._id)
            .populate('customerId', 'firstName lastName phoneNumber')
            .populate('assignedAgent', 'firstName lastName email')
            .populate('escalatedTo', 'firstName lastName email')
            .populate('notes.agent', 'firstName lastName');

        // Emit Socket.io event with full ticket
        if (io) {
            io.emit('ticket_escalated', {
                ticket: populatedTicket
            });
        }

        return populatedTicket;
    }

    /**
     * Update ticket
     */
    async updateTicket(ticketId, updates) {
        // Validate category if being updated
        if (updates.category) {
            const isValidCategory = await this.validateCategory(updates.category);
            if (!isValidCategory) {
                throw new Error('Categoría de ticket inválida');
            }
        }

        // Find ticket by either ID type
        const existingTicket = await this.findTicketByAnyId(ticketId);
        if (!existingTicket) {
            throw new Error('Ticket no encontrado');
        }

        const ticket = await Ticket.findByIdAndUpdate(
            existingTicket._id,
            updates,
            { new: true }
        ).populate(['customerId', 'conversationId', 'assignedAgent']);

        // Emit Socket.io event
        if (io) {
            io.emit('ticket_updated', {
                ticketId: ticket.ticketId,
                updates,
                ticket
            });
        }

        return ticket;
    }

    /**
     * Get ticket statistics
     */
    async getTicketStatistics(options = {}) {
        const { agentId, customerId } = options;

        const query = {};
        if (agentId) query.assignedAgent = agentId;
        if (customerId) query.customerId = customerId;

        const [
            total,
            newTickets,
            openTickets,
            inProgressTickets,
            resolvedTickets,
            closedTickets,
            byCategory,
            byPriority
        ] = await Promise.all([
            Ticket.countDocuments(query),
            Ticket.countDocuments({ ...query, status: 'new' }),
            Ticket.countDocuments({ ...query, status: 'open' }),
            Ticket.countDocuments({ ...query, status: 'in_progress' }),
            Ticket.countDocuments({ ...query, status: 'resolved' }),
            Ticket.countDocuments({ ...query, status: 'closed' }),
            Ticket.aggregate([
                { $match: query },
                { $group: { _id: '$category', count: { $sum: 1 } } }
            ]),
            Ticket.aggregate([
                { $match: query },
                { $group: { _id: '$priority', count: { $sum: 1 } } }
            ])
        ]);

        return {
            total,
            byStatus: {
                new: newTickets,
                open: openTickets,
                in_progress: inProgressTickets,
                resolved: resolvedTickets,
                closed: closedTickets
            },
            byCategory,
            byPriority
        };
    }
}

module.exports = new TicketService();
