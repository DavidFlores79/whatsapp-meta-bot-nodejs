const Customer = require('../models/Customer');
const Conversation = require('../models/Conversation');
const Message = require('../models/Message');

/**
 * GET /api/v2/customers
 * List all customers with pagination, filtering, and search
 */
async function listCustomers(req, res) {
    try {
        const {
            page = 1,
            limit = 20,
            search = '',
            status = '',
            segment = '',
            tags = '',
            sortBy = 'lastInteraction',
            sortOrder = 'desc'
        } = req.query;

        // Build filter query
        const filter = {};

        // Search across multiple fields
        if (search) {
            filter.$or = [
                { phoneNumber: { $regex: search, $options: 'i' } },
                { firstName: { $regex: search, $options: 'i' } },
                { lastName: { $regex: search, $options: 'i' } },
                { email: { $regex: search, $options: 'i' } }
            ];
        }

        // Filter by status
        if (status) {
            filter.status = status;
        }

        // Filter by segment
        if (segment) {
            filter.segment = segment;
        }

        // Filter by tags
        if (tags) {
            const tagArray = tags.split(',').map(t => t.trim());
            filter.tags = { $in: tagArray };
        }

        // Calculate pagination
        const skip = (parseInt(page) - 1) * parseInt(limit);

        // Sort configuration
        const sort = {};
        sort[sortBy] = sortOrder === 'asc' ? 1 : -1;

        // Execute query
        const [customers, total] = await Promise.all([
            Customer.find(filter)
                .sort(sort)
                .skip(skip)
                .limit(parseInt(limit))
                .select('-__v'),
            Customer.countDocuments(filter)
        ]);

        return res.json({
            success: true,
            customers,
            pagination: {
                page: parseInt(page),
                limit: parseInt(limit),
                total,
                pages: Math.ceil(total / parseInt(limit))
            }
        });
    } catch (error) {
        console.error('List customers error:', error);
        return res.status(500).json({ error: error.message });
    }
}

/**
 * GET /api/v2/customers/:id
 * Get detailed customer information
 */
async function getCustomer(req, res) {
    try {
        const { id } = req.params;

        const customer = await Customer.findById(id)
            .populate('preferences.preferredAgent', 'firstName lastName email')
            .select('-__v');

        if (!customer) {
            return res.status(404).json({ error: 'Customer not found' });
        }

        // Get customer conversation statistics
        const conversationStats = await Conversation.aggregate([
            { $match: { customerId: customer._id } },
            {
                $group: {
                    _id: null,
                    totalConversations: { $sum: 1 },
                    openConversations: {
                        $sum: { $cond: [{ $eq: ['$status', 'open'] }, 1, 0] }
                    },
                    resolvedConversations: {
                        $sum: { $cond: [{ $eq: ['$status', 'resolved'] }, 1, 0] }
                    }
                }
            }
        ]);

        // Get recent conversations
        const recentConversations = await Conversation.find({ customerId: customer._id })
            .sort({ updatedAt: -1 })
            .limit(5)
            .populate('assignedAgent', 'firstName lastName')
            .select('status priority lastMessage createdAt updatedAt');

        return res.json({
            success: true,
            customer,
            statistics: conversationStats[0] || {
                totalConversations: 0,
                openConversations: 0,
                resolvedConversations: 0
            },
            recentConversations
        });
    } catch (error) {
        console.error('Get customer error:', error);
        return res.status(500).json({ error: error.message });
    }
}

/**
 * POST /api/v2/customers
 * Create a new customer
 */
async function createCustomer(req, res) {
    try {
        const {
            phoneNumber,
            firstName,
            lastName,
            email,
            avatar,
            tags,
            segment,
            source,
            address,
            notes,
            customFields,
            preferences
        } = req.body;

        // Validate required fields
        if (!phoneNumber) {
            return res.status(400).json({ error: 'Phone number is required' });
        }

        // Check if customer already exists
        const existingCustomer = await Customer.findOne({ phoneNumber });
        if (existingCustomer) {
            return res.status(409).json({ error: 'Customer already exists' });
        }

        // Create customer
        const customer = await Customer.create({
            phoneNumber,
            firstName,
            lastName,
            email,
            avatar: avatar || `https://i.pravatar.cc/150?u=${phoneNumber}`,
            tags: tags || [],
            segment: segment || 'new',
            source: source || 'whatsapp',
            address,
            notes,
            customFields,
            preferences,
            firstContact: new Date(),
            lastInteraction: new Date()
        });

        return res.status(201).json({
            success: true,
            customer
        });
    } catch (error) {
        console.error('Create customer error:', error);
        return res.status(500).json({ error: error.message });
    }
}

/**
 * PUT /api/v2/customers/:id
 * Update customer information (standard CRM edit operation)
 */
async function updateCustomer(req, res) {
    try {
        const { id } = req.params;
        const updates = req.body;

        // Prevent updating critical fields
        delete updates._id;
        delete updates.createdAt;
        delete updates.statistics; // Statistics should be updated programmatically

        // Handle phone number uniqueness if changed
        if (updates.phoneNumber) {
            const existing = await Customer.findOne({
                phoneNumber: updates.phoneNumber,
                _id: { $ne: id }
            });
            if (existing) {
                return res.status(409).json({ error: 'Phone number already in use' });
            }
        }

        const customer = await Customer.findByIdAndUpdate(
            id,
            { $set: updates },
            { new: true, runValidators: true }
        );

        if (!customer) {
            return res.status(404).json({ error: 'Customer not found' });
        }

        return res.json({
            success: true,
            customer
        });
    } catch (error) {
        console.error('Update customer error:', error);
        return res.status(500).json({ error: error.message });
    }
}

/**
 * PATCH /api/v2/customers/:id/tags
 * Update customer tags (CRM segmentation feature)
 */
async function updateCustomerTags(req, res) {
    try {
        const { id } = req.params;
        const { tags, action = 'set' } = req.body; // action: 'set', 'add', 'remove'

        if (!Array.isArray(tags)) {
            return res.status(400).json({ error: 'Tags must be an array' });
        }

        let update = {};
        if (action === 'add') {
            update = { $addToSet: { tags: { $each: tags } } };
        } else if (action === 'remove') {
            update = { $pull: { tags: { $in: tags } } };
        } else {
            update = { $set: { tags } };
        }

        const customer = await Customer.findByIdAndUpdate(
            id,
            update,
            { new: true }
        );

        if (!customer) {
            return res.status(404).json({ error: 'Customer not found' });
        }

        return res.json({
            success: true,
            customer
        });
    } catch (error) {
        console.error('Update tags error:', error);
        return res.status(500).json({ error: error.message });
    }
}

/**
 * PATCH /api/v2/customers/:id/block
 * Block/unblock customer
 */
async function toggleBlockCustomer(req, res) {
    try {
        const { id } = req.params;
        const { isBlocked, blockReason } = req.body;

        const customer = await Customer.findByIdAndUpdate(
            id,
            {
                $set: {
                    isBlocked,
                    blockReason: isBlocked ? blockReason : null,
                    status: isBlocked ? 'blocked' : 'active'
                }
            },
            { new: true }
        );

        if (!customer) {
            return res.status(404).json({ error: 'Customer not found' });
        }

        return res.json({
            success: true,
            customer
        });
    } catch (error) {
        console.error('Block customer error:', error);
        return res.status(500).json({ error: error.message });
    }
}

/**
 * DELETE /api/v2/customers/:id
 * Delete customer (soft delete recommended - change status to inactive)
 */
async function deleteCustomer(req, res) {
    try {
        const { id } = req.params;
        const { permanent = false } = req.query;

        if (permanent === 'true') {
            // Hard delete - also delete related conversations and messages
            await Promise.all([
                Customer.findByIdAndDelete(id),
                Conversation.deleteMany({ customerId: id }),
                Message.deleteMany({ customerId: id })
            ]);

            return res.json({
                success: true,
                message: 'Customer permanently deleted'
            });
        } else {
            // Soft delete - just mark as inactive
            const customer = await Customer.findByIdAndUpdate(
                id,
                { $set: { status: 'inactive' } },
                { new: true }
            );

            if (!customer) {
                return res.status(404).json({ error: 'Customer not found' });
            }

            return res.json({
                success: true,
                message: 'Customer deactivated',
                customer
            });
        }
    } catch (error) {
        console.error('Delete customer error:', error);
        return res.status(500).json({ error: error.message });
    }
}

/**
 * GET /api/v2/customers/:id/conversations
 * Get all conversations for a customer
 */
async function getCustomerConversations(req, res) {
    try {
        const { id } = req.params;
        const { page = 1, limit = 20 } = req.query;

        const skip = (parseInt(page) - 1) * parseInt(limit);

        const [conversations, total] = await Promise.all([
            Conversation.find({ customerId: id })
                .sort({ updatedAt: -1 })
                .skip(skip)
                .limit(parseInt(limit))
                .populate('assignedAgent', 'firstName lastName email'),
            Conversation.countDocuments({ customerId: id })
        ]);

        return res.json({
            success: true,
            conversations,
            pagination: {
                page: parseInt(page),
                limit: parseInt(limit),
                total,
                pages: Math.ceil(total / parseInt(limit))
            }
        });
    } catch (error) {
        console.error('Get customer conversations error:', error);
        return res.status(500).json({ error: error.message });
    }
}

/**
 * GET /api/v2/customers/stats/summary
 * Get customer statistics summary (CRM dashboard data)
 */
async function getCustomerStats(req, res) {
    try {
        const stats = await Customer.aggregate([
            {
                $group: {
                    _id: null,
                    totalCustomers: { $sum: 1 },
                    activeCustomers: {
                        $sum: { $cond: [{ $eq: ['$status', 'active'] }, 1, 0] }
                    },
                    vipCustomers: {
                        $sum: { $cond: [{ $eq: ['$segment', 'vip'] }, 1, 0] }
                    },
                    blockedCustomers: {
                        $sum: { $cond: ['$isBlocked', 1, 0] }
                    },
                    newThisMonth: {
                        $sum: {
                            $cond: [
                                {
                                    $gte: [
                                        '$createdAt',
                                        new Date(new Date().getFullYear(), new Date().getMonth(), 1)
                                    ]
                                },
                                1,
                                0
                            ]
                        }
                    }
                }
            }
        ]);

        // Segment distribution
        const segments = await Customer.aggregate([
            {
                $group: {
                    _id: '$segment',
                    count: { $sum: 1 }
                }
            }
        ]);

        return res.json({
            success: true,
            summary: stats[0] || {
                totalCustomers: 0,
                activeCustomers: 0,
                vipCustomers: 0,
                blockedCustomers: 0,
                newThisMonth: 0
            },
            segments
        });
    } catch (error) {
        console.error('Get customer stats error:', error);
        return res.status(500).json({ error: error.message });
    }
}

/**
 * POST /api/v2/customers/bulk/import
 * Bulk import customers (CSV/JSON) - Standard CRM feature
 */
async function bulkImportCustomers(req, res) {
    try {
        const { customers } = req.body;

        if (!Array.isArray(customers) || customers.length === 0) {
            return res.status(400).json({ error: 'Customers array required' });
        }

        const results = {
            success: [],
            failed: [],
            duplicates: []
        };

        for (const customerData of customers) {
            try {
                // Check for existing customer
                const existing = await Customer.findOne({
                    phoneNumber: customerData.phoneNumber
                });

                if (existing) {
                    results.duplicates.push({
                        phoneNumber: customerData.phoneNumber,
                        reason: 'Already exists'
                    });
                    continue;
                }

                // Create customer
                const customer = await Customer.create({
                    ...customerData,
                    avatar: customerData.avatar || `https://i.pravatar.cc/150?u=${customerData.phoneNumber}`,
                    firstContact: new Date(),
                    lastInteraction: new Date()
                });

                results.success.push(customer);
            } catch (err) {
                results.failed.push({
                    phoneNumber: customerData.phoneNumber,
                    reason: err.message
                });
            }
        }

        return res.json({
            success: true,
            results: {
                imported: results.success.length,
                duplicates: results.duplicates.length,
                failed: results.failed.length
            },
            details: results
        });
    } catch (error) {
        console.error('Bulk import error:', error);
        return res.status(500).json({ error: error.message });
    }
}

/**
 * GET /api/v2/customers/export
 * Export customers to CSV/JSON - Standard CRM feature
 */
async function exportCustomers(req, res) {
    try {
        const { format = 'json', ...filters } = req.query;

        // Build filter from query params
        const filter = {};
        if (filters.status) filter.status = filters.status;
        if (filters.segment) filter.segment = filters.segment;
        if (filters.tags) {
            const tagArray = filters.tags.split(',').map(t => t.trim());
            filter.tags = { $in: tagArray };
        }

        const customers = await Customer.find(filter).select('-__v').lean();

        if (format === 'csv') {
            // Convert to CSV format
            const csv = convertToCSV(customers);
            res.setHeader('Content-Type', 'text/csv');
            res.setHeader('Content-Disposition', 'attachment; filename=customers.csv');
            return res.send(csv);
        } else {
            // JSON format
            res.setHeader('Content-Type', 'application/json');
            res.setHeader('Content-Disposition', 'attachment; filename=customers.json');
            return res.json({ success: true, customers });
        }
    } catch (error) {
        console.error('Export customers error:', error);
        return res.status(500).json({ error: error.message });
    }
}

// Helper function to convert JSON to CSV
function convertToCSV(data) {
    if (!data || data.length === 0) return '';

    const headers = [
        'phoneNumber',
        'firstName',
        'lastName',
        'email',
        'status',
        'segment',
        'tags',
        'notes',
        'createdAt',
        'lastInteraction'
    ];

    const csvRows = [headers.join(',')];

    for (const row of data) {
        const values = headers.map(header => {
            let value = row[header];
            if (Array.isArray(value)) value = value.join(';');
            if (value instanceof Date) value = value.toISOString();
            if (value === null || value === undefined) value = '';
            // Escape commas and quotes
            value = String(value).replace(/"/g, '""');
            return `"${value}"`;
        });
        csvRows.push(values.join(','));
    }

    return csvRows.join('\n');
}

module.exports = {
    listCustomers,
    getCustomer,
    createCustomer,
    updateCustomer,
    updateCustomerTags,
    toggleBlockCustomer,
    deleteCustomer,
    getCustomerConversations,
    getCustomerStats,
    bulkImportCustomers,
    exportCustomers
};
