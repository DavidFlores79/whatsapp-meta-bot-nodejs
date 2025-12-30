const Ticket = require('../models/Ticket');
const TicketCounter = require('../models/TicketCounter');
const Customer = require('../models/Customer');
const configService = require('./configurationService');
const { io } = require('../models/server');
const mongoose = require('mongoose');
const whatsappService = require('./whatsappService');
const { buildTextJSON } = require('../shared/whatsappModels');

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
        const { subject, description, category, priority, customerId, conversationId, tags, attachments, location } = data;

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
            tags,
            attachments: attachments || [],
            location: location || undefined
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
                .populate('resolution.resolvedBy', 'firstName lastName email')
                .populate('notes.agent', 'firstName lastName');
        }

        // If not found by _id, try ticketId (human-readable ID)
        // Use case-insensitive search with regex
        if (!ticket) {
            ticket = await Ticket.findOne({ ticketId: { $regex: new RegExp(`^${id}$`, 'i') } })
                .populate('customerId', 'firstName lastName phoneNumber email')
                .populate('conversationId')
                .populate('assignedAgent', 'firstName lastName email')
                .populate('escalatedTo', 'firstName lastName email')
                .populate('resolution.resolvedBy', 'firstName lastName email')
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
        const { page = 1, limit = 20, status, excludeStatus } = options;

        const query = { customerId };
        if (status) {
            query.status = status;
        }
        if (excludeStatus) {
            query.status = { $ne: excludeStatus };
        }

        const tickets = await Ticket.find(query)
            .populate('assignedAgent', 'firstName lastName')
            .populate('notes.agent', 'firstName lastName')
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

        // Auto-assign ticket to agent when they start working on it
        if (newStatus === 'in_progress' && !ticket.assignedAgent) {
            ticket.assignedAgent = agentId;
            console.log(`🎯 Auto-assigned ticket ${ticket.ticketId} to agent ${agentId} (started working)`);
        }

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

        // Auto-assign ticket to resolving agent if not already assigned
        if (!ticket.assignedAgent) {
            ticket.assignedAgent = agentId;
            console.log(`🎯 Auto-assigned ticket ${ticket.ticketId} to agent ${agentId} (resolved by)`);
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

        // Send WhatsApp notification to customer
        await this.sendTicketResolvedNotification(populatedTicket);

        return populatedTicket;
    }

    /**
     * Send WhatsApp notification when ticket is resolved
     */
    async sendTicketResolvedNotification(ticket) {
        try {
            const customer = ticket.customerId;
            const agent = ticket.resolution?.resolvedBy;
            const configData = await configService.getAssistantConfig();

            if (!customer || !customer.phoneNumber) {
                console.log('⚠️ Cannot send resolution notification: customer or phone number missing');
                return;
            }

            // Format resolution date
            const resolvedDate = new Date(ticket.resolution.resolvedAt);
            const formattedDate = resolvedDate.toLocaleString('es-MX', {
                day: '2-digit',
                month: '2-digit',
                year: 'numeric',
                hour: '2-digit',
                minute: '2-digit'
            });

            // Build notification message
            const agentName = agent ? `${agent.firstName} ${agent.lastName}` : 'Nuestro equipo';
            const companyName = configData.companyName || process.env.COMPANY_NAME || 'LUXFREE';

            const message = `✅ *Ticket Resuelto*

Hola ${customer.firstName},

Tu ticket *${ticket.ticketId}* ha sido marcado como resuelto.

📋 *Resumen de la solución:*
${ticket.resolution.summary}

*Resuelto por:* ${agentName}
*Fecha:* ${formattedDate}

¿Tu problema está completamente resuelto?

Si aún tienes algún inconveniente o necesitas ayuda adicional, puedes responder a este mensaje y tu ticket será reabierto automáticamente.

Gracias por tu paciencia.
- Equipo ${companyName}`;

            const messagePayload = buildTextJSON(customer.phoneNumber, message);
            await whatsappService.sendWhatsappResponse(messagePayload);

            console.log(`📤 Ticket resolution notification sent to ${customer.phoneNumber} for ticket ${ticket.ticketId}`);
        } catch (error) {
            console.error('❌ Error sending ticket resolution notification:', error);
            // Don't throw error - notification failure shouldn't break ticket resolution
        }
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

    /**
     * Check if a customer has a recently resolved ticket that can be reopened
     * Returns the ticket if found, null otherwise
     */
    async findRecentResolvedTicket(customerId) {
        const behavior = await configService.getTicketBehavior();
        const windowHours = behavior.autoReopenWindowHours || 72;
        const allowReopenClosed = behavior.allowReopenClosed || false;
        const allowReopenEscalated = behavior.allowReopenEscalated || false;

        // Calculate cutoff time
        const cutoffTime = new Date();
        cutoffTime.setHours(cutoffTime.getHours() - windowHours);

        // Build query
        const query = {
            customerId,
            $or: [
                { status: 'resolved' }
            ],
            'resolution.resolvedAt': { $gte: cutoffTime }
        };

        // Add closed status if allowed
        if (allowReopenClosed) {
            query.$or.push({ status: 'closed' });
        }

        // Exclude escalated tickets unless allowed
        if (!allowReopenEscalated) {
            query.isEscalated = { $ne: true };
        }

        // Find most recent matching ticket
        const ticket = await Ticket.findOne(query)
            .sort({ 'resolution.resolvedAt': -1 })
            .populate('assignedAgent', 'firstName lastName email');

        return ticket;
    }

    /**
     * Reopen a resolved ticket
     */
    async reopenTicket(ticketId, reason = 'Customer requested additional assistance') {
        const ticket = await this.findTicketByAnyId(ticketId);
        if (!ticket) {
            throw new Error('Ticket no encontrado');
        }

        const behavior = await configService.getTicketBehavior();
        const maxReopenCount = behavior.maxReopenCount || 3;

        // Check if ticket can be reopened
        if (ticket.status !== 'resolved' && ticket.status !== 'closed') {
            throw new Error('Solo se pueden reabrir tickets resueltos o cerrados');
        }

        if (ticket.reopenCount >= maxReopenCount) {
            throw new Error(`El ticket ha alcanzado el límite máximo de reaperturas (${maxReopenCount})`);
        }

        const oldStatus = ticket.status;

        // Update ticket
        ticket.status = 'open';
        ticket.reopenCount = (ticket.reopenCount || 0) + 1;
        ticket.lastReopenedAt = new Date();
        ticket.closedAt = null; // Clear closed date

        // Add to status history
        ticket.statusHistory.push({
            from: oldStatus,
            to: 'open',
            changedBy: null, // System action
            changedAt: new Date(),
            reason
        });

        await ticket.save();

        // Populate for Socket.io event
        const populatedTicket = await Ticket.findById(ticket._id)
            .populate('customerId', 'firstName lastName phoneNumber')
            .populate('assignedAgent', 'firstName lastName email')
            .populate('resolution.resolvedBy', 'firstName lastName')
            .populate('notes.agent', 'firstName lastName');

        // Emit Socket.io event
        if (io) {
            io.emit('ticket_reopened', {
                ticket: populatedTicket,
                previousStatus: oldStatus,
                reopenCount: ticket.reopenCount
            });
        }

        console.log(`🔄 Ticket ${ticket.ticketId} reopened (count: ${ticket.reopenCount})`);

        return populatedTicket;
    }

    /**
     * Get conversation attachments for a ticket (not already attached to ANY ticket)
     * Filtered by time range based on configuration (default: 48 hours)
     */
    async getConversationAttachments(ticketId) {
        const ticket = await Ticket.findOne({ $or: [{ _id: ticketId }, { ticketId }] });

        if (!ticket || !ticket.conversationId) {
            return [];
        }

        // Get time limit from configuration (default 48 hours)
        const configService = require('./configurationService');
        const ticketBehavior = await configService.getTicketBehavior();
        const hoursLimit = ticketBehavior.attachmentHoursLimit || 48;

        // Calculate cutoff date
        const cutoffDate = new Date();
        cutoffDate.setHours(cutoffDate.getHours() - hoursLimit);

        // Get all messages from the conversation with attachments within time limit
        const Message = require('../models/Message');
        const messages = await Message.find({
            conversationId: ticket.conversationId,
            'attachments.0': { $exists: true }, // Has at least one attachment
            sender: 'customer', // Only customer attachments
            timestamp: { $gte: cutoffDate } // Only recent messages
        }).sort({ timestamp: -1 });

        // Get message IDs that are already attached to ANY ticket in this conversation
        const allTickets = await Ticket.find({
            conversationId: ticket.conversationId,
            'attachments.0': { $exists: true }
        }).select('attachments');

        const attachedMessageIds = new Set();
        allTickets.forEach(t => {
            (t.attachments || []).forEach(att => {
                if (att.messageId) {
                    attachedMessageIds.add(att.messageId.toString());
                }
            });
        });

        // Extract attachments that aren't already attached to ANY ticket
        const conversationAttachments = [];
        messages.forEach(msg => {
            if (!attachedMessageIds.has(msg._id.toString())) {
                msg.attachments.forEach(att => {
                    conversationAttachments.push({
                        messageId: msg._id,
                        type: att.type,
                        url: att.url,
                        publicId: att.publicId,
                        filename: att.filename,
                        mimeType: att.mimeType,
                        timestamp: msg.timestamp,
                        content: msg.content
                    });
                });
            }
        });

        return conversationAttachments;
    }

    /**
     * Attach a conversation message's attachment to a ticket
     */
    async attachMessageToTicket(ticketId, messageId) {
        const ticket = await Ticket.findOne({ $or: [{ _id: ticketId }, { ticketId }] });

        if (!ticket) {
            throw new Error('Ticket no encontrado');
        }

        const Message = require('../models/Message');
        const message = await Message.findById(messageId);

        if (!message || !message.attachments || message.attachments.length === 0) {
            throw new Error('Mensaje o adjunto no encontrado');
        }

        // Check if this message is already attached to ANY ticket
        const existingTicket = await Ticket.findOne({
            conversationId: ticket.conversationId,
            'attachments.messageId': messageId
        }).select('ticketId');

        if (existingTicket) {
            throw new Error(`Este adjunto ya está vinculado al ticket ${existingTicket.ticketId}`);
        }

        // Add all attachments from this message to the ticket
        const newAttachments = message.attachments.map(att => ({
            type: att.type,
            url: att.url,
            publicId: att.publicId,
            filename: att.filename,
            mimeType: att.mimeType,
            messageId: message._id,
            addedAt: new Date()
        }));

        ticket.attachments = ticket.attachments || [];
        ticket.attachments.push(...newAttachments);

        await ticket.save();

        // Populate and return
        const populatedTicket = await Ticket.findById(ticket._id)
            .populate('customerId', 'firstName lastName phoneNumber')
            .populate('assignedAgent', 'firstName lastName email')
            .populate('resolution.resolvedBy', 'firstName lastName')
            .populate('notes.agent', 'firstName lastName');

        // Emit Socket.io event
        if (io) {
            io.emit('ticket_updated', {
                ticket: populatedTicket
            });
        }

        return populatedTicket;
    }

    /**
     * Remove an attachment from a ticket
     */
    async removeAttachmentFromTicket(ticketId, attachmentId) {
        const ticket = await Ticket.findOne({ $or: [{ _id: ticketId }, { ticketId }] });

        if (!ticket) {
            throw new Error('Ticket no encontrado');
        }

        if (!ticket.attachments || ticket.attachments.length === 0) {
            throw new Error('El ticket no tiene adjuntos');
        }

        // Find the attachment to remove
        const attachmentIndex = ticket.attachments.findIndex(
            att => att._id.toString() === attachmentId
        );

        if (attachmentIndex === -1) {
            throw new Error('Adjunto no encontrado en el ticket');
        }

        // Remove the attachment
        ticket.attachments.splice(attachmentIndex, 1);
        await ticket.save();

        // Populate and return
        const populatedTicket = await Ticket.findById(ticket._id)
            .populate('customerId', 'firstName lastName phoneNumber')
            .populate('assignedAgent', 'firstName lastName email')
            .populate('resolution.resolvedBy', 'firstName lastName')
            .populate('notes.agent', 'firstName lastName');

        // Emit Socket.io event
        if (io) {
            io.emit('ticket_updated', {
                ticket: populatedTicket
            });
        }

        return populatedTicket;
    }
}

module.exports = new TicketService();
