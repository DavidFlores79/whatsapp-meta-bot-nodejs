const Customer = require('../models/Customer');
const Conversation = require('../models/Conversation');
const Message = require('../models/Message');
const XLSX = require('xlsx');

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
 * PATCH /api/v2/customers/:id/reactivate
 * Reactivate a deactivated customer (change status from inactive to active)
 */
async function reactivateCustomer(req, res) {
    try {
        const { id } = req.params;

        // Find customer
        const customer = await Customer.findById(id);

        if (!customer) {
            return res.status(404).json({ error: 'Customer not found' });
        }

        // Check if customer is inactive
        if (customer.status !== 'inactive') {
            return res.status(400).json({ 
                error: 'Customer is not inactive',
                currentStatus: customer.status 
            });
        }

        // Reactivate customer
        customer.status = 'active';
        await customer.save();

        return res.json({
            success: true,
            message: 'Customer reactivated successfully',
            customer
        });
    } catch (error) {
        console.error('Reactivate customer error:', error);
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
 * Bulk import customers from XLSX/CSV/XLS file - Standard CRM feature
 */
async function bulkImportCustomers(req, res) {
    try {
        // Check if file was uploaded
        if (!req.file) {
            return res.status(400).json({
                success: false,
                error: 'No file uploaded. Please upload an XLSX, XLS, or CSV file.'
            });
        }

        // Parse the file
        const workbook = XLSX.read(req.file.buffer, { type: 'buffer' });
        
        // Try to find "Import Template" sheet first, otherwise use first sheet
        let sheetName = workbook.SheetNames.find(name => 
            name.toLowerCase().includes('import') || 
            name.toLowerCase().includes('template')
        );
        
        // If no template sheet found, use the first sheet
        if (!sheetName) {
            sheetName = workbook.SheetNames[0];
        }
        
        const worksheet = workbook.Sheets[sheetName];
        
        // Convert to JSON
        const rawData = XLSX.utils.sheet_to_json(worksheet);

        // Filter out empty rows (rows with no data)
        const validData = rawData.filter(row => {
            // Check if row has any non-empty values
            return Object.values(row).some(value => 
                value !== null && 
                value !== undefined && 
                value !== '' && 
                String(value).trim() !== ''
            );
        });

        if (!validData || validData.length === 0) {
            return res.status(400).json({
                success: false,
                error: 'File is empty or contains no valid data'
            });
        }

        const results = {
            success: [],
            failed: [],
            duplicates: [],
            updated: []
        };

        // Process each row
        for (let i = 0; i < validData.length; i++) {
            const row = validData[i];
            
            try {
                // Validate required field
                if (!row.phoneNumber && !row.phone_number && !row.phone) {
                    results.failed.push({
                        row: i + 2, // +2 because Excel rows start at 1 and header is row 1
                        data: row,
                        reason: 'Missing phone number'
                    });
                    continue;
                }

                // Normalize phone number field
                const phoneNumber = row.phoneNumber || row.phone_number || row.phone;

                // Build customer data object
                const customerData = {
                    phoneNumber: String(phoneNumber).trim(),
                    firstName: row.firstName || row.first_name || '',
                    lastName: row.lastName || row.last_name || '',
                    email: row.email || '',
                    status: row.status || 'active',
                    segment: row.segment || 'new',
                    source: row.source || 'whatsapp',
                    notes: row.notes || '',
                    tags: row.tags ? (typeof row.tags === 'string' ? row.tags.split(';').map(t => t.trim()) : []) : [],
                };

                // Optional address fields
                if (row.address_street || row.address_city || row.address_state) {
                    customerData.address = {
                        street: row.address_street || '',
                        city: row.address_city || '',
                        state: row.address_state || '',
                        country: row.address_country || 'México',
                        postalCode: row.address_postalCode || row.address_postal_code || ''
                    };
                }

                // Alternative phones
                if (row.alternativePhones || row.alternative_phones) {
                    const altPhones = row.alternativePhones || row.alternative_phones;
                    customerData.alternativePhones = typeof altPhones === 'string' 
                        ? altPhones.split(';').map(p => p.trim())
                        : [];
                }

                // Check for existing customer
                const existing = await Customer.findOne({
                    phoneNumber: customerData.phoneNumber
                });

                if (existing) {
                    // Option to update existing customers
                    if (req.body.updateExisting === 'true' || req.body.updateExisting === true) {
                        Object.assign(existing, customerData);
                        existing.lastInteraction = new Date();
                        await existing.save();
                        
                        results.updated.push({
                            row: i + 2,
                            phoneNumber: customerData.phoneNumber,
                            id: existing._id
                        });
                    } else {
                        results.duplicates.push({
                            row: i + 2,
                            phoneNumber: customerData.phoneNumber,
                            reason: 'Customer already exists'
                        });
                    }
                    continue;
                }

                // Create new customer
                const customer = await Customer.create({
                    ...customerData,
                    avatar: customerData.avatar || `https://i.pravatar.cc/150?u=${customerData.phoneNumber}`,
                    firstContact: new Date(),
                    lastInteraction: new Date()
                });

                results.success.push({
                    row: i + 2,
                    phoneNumber: customer.phoneNumber,
                    id: customer._id
                });
            } catch (err) {
                results.failed.push({
                    row: i + 2,
                    data: row,
                    reason: err.message
                });
            }
        }

        return res.json({
            success: true,
            message: 'Import completed',
            results: {
                total: rawData.length,
                imported: results.success.length,
                updated: results.updated.length,
                duplicates: results.duplicates.length,
                failed: results.failed.length
            },
            details: {
                success: results.success,
                updated: results.updated,
                duplicates: results.duplicates,
                failed: results.failed
            }
        });
    } catch (error) {
        console.error('Bulk import error:', error);
        return res.status(500).json({
            success: false,
            error: error.message
        });
    }
}

/**
 * GET /api/v2/customers/export
 * Export customers to XLSX/CSV - Standard CRM feature
 */
async function exportCustomers(req, res) {
    try {
        const { format = 'xlsx', ...filters } = req.query;

        // Build filter from query params
        const filter = {};
        if (filters.status) filter.status = filters.status;
        if (filters.segment) filter.segment = filters.segment;
        if (filters.tags) {
            const tagArray = filters.tags.split(',').map(t => t.trim());
            filter.tags = { $in: tagArray };
        }

        const customers = await Customer.find(filter)
            .select('-__v -statistics -preferences')
            .lean();

        if (customers.length === 0) {
            return res.status(404).json({
                success: false,
                error: 'No customers found matching the criteria'
            });
        }

        // Prepare data for export
        const exportData = customers.map(customer => ({
            phoneNumber: customer.phoneNumber,
            firstName: customer.firstName || '',
            lastName: customer.lastName || '',
            email: customer.email || '',
            status: customer.status || '',
            segment: customer.segment || '',
            source: customer.source || '',
            tags: Array.isArray(customer.tags) ? customer.tags.join(';') : '',
            alternativePhones: Array.isArray(customer.alternativePhones) 
                ? customer.alternativePhones.join(';') 
                : '',
            address_street: customer.address?.street || '',
            address_city: customer.address?.city || '',
            address_state: customer.address?.state || '',
            address_country: customer.address?.country || '',
            address_postalCode: customer.address?.postalCode || '',
            notes: customer.notes || '',
            isBlocked: customer.isBlocked ? 'Yes' : 'No',
            blockReason: customer.blockReason || '',
            firstContact: customer.firstContact ? new Date(customer.firstContact).toISOString() : '',
            lastInteraction: customer.lastInteraction ? new Date(customer.lastInteraction).toISOString() : '',
            createdAt: customer.createdAt ? new Date(customer.createdAt).toISOString() : ''
        }));

        // Create workbook
        const worksheet = XLSX.utils.json_to_sheet(exportData);
        const workbook = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(workbook, worksheet, 'Customers');

        // Set column widths for better readability
        worksheet['!cols'] = [
            { wch: 15 }, // phoneNumber
            { wch: 15 }, // firstName
            { wch: 15 }, // lastName
            { wch: 25 }, // email
            { wch: 10 }, // status
            { wch: 10 }, // segment
            { wch: 12 }, // source
            { wch: 20 }, // tags
            { wch: 20 }, // alternativePhones
            { wch: 30 }, // address_street
            { wch: 15 }, // address_city
            { wch: 15 }, // address_state
            { wch: 10 }, // address_country
            { wch: 10 }, // address_postalCode
            { wch: 40 }, // notes
            { wch: 10 }, // isBlocked
            { wch: 20 }, // blockReason
            { wch: 20 }, // firstContact
            { wch: 20 }, // lastInteraction
            { wch: 20 }  // createdAt
        ];

        if (format === 'csv') {
            // Export as CSV with UTF-8 BOM for Excel compatibility
            const csv = XLSX.utils.sheet_to_csv(worksheet);
            const csvWithBOM = '\uFEFF' + csv; // Add UTF-8 BOM
            res.setHeader('Content-Type', 'text/csv; charset=utf-8');
            res.setHeader('Content-Disposition', `attachment; filename=customers_${Date.now()}.csv`);
            return res.send(Buffer.from(csvWithBOM, 'utf8'));
        } else {
            // Export as XLSX with proper encoding
            const buffer = XLSX.write(workbook, { 
                type: 'buffer', 
                bookType: 'xlsx',
                bookSST: false,
                type: 'buffer'
            });
            res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet; charset=utf-8');
            res.setHeader('Content-Disposition', `attachment; filename=customers_${Date.now()}.xlsx`);
            return res.send(buffer);
        }
    } catch (error) {
        console.error('Export customers error:', error);
        return res.status(500).json({
            success: false,
            error: error.message
        });
    }
}

/**
 * GET /api/v2/customers/template
 * Download a template XLSX file for customer imports
 */
async function downloadImportTemplate(req, res) {
    try {
        // Sample data to help users understand the format
        const sampleData = [
            {
                phoneNumber: '529991234567',
                firstName: 'Juan',
                lastName: 'Pérez',
                email: 'juan.perez@example.com',
                status: 'active',
                segment: 'regular',
                source: 'whatsapp',
                tags: 'vip;premium',
                alternativePhones: '529991234568',
                address_street: 'Calle Principal 123',
                address_city: 'Mérida',
                address_state: 'Yucatán',
                address_country: 'México',
                address_postalCode: '97000',
                notes: 'Cliente preferente'
            },
            {
                phoneNumber: '529997654321',
                firstName: 'María',
                lastName: 'García',
                email: 'maria.garcia@example.com',
                status: 'active',
                segment: 'new',
                source: 'referral',
                tags: 'new-customer',
                alternativePhones: '',
                address_street: '',
                address_city: '',
                address_state: '',
                address_country: 'México',
                address_postalCode: '',
                notes: ''
            }
        ];

        // Create instructions sheet
        const instructions = [
            { Field: 'phoneNumber', Required: 'YES', Description: 'Customer phone number (include country code)', Example: '529991234567' },
            { Field: 'firstName', Required: 'NO', Description: 'Customer first name', Example: 'Juan' },
            { Field: 'lastName', Required: 'NO', Description: 'Customer last name', Example: 'Pérez' },
            { Field: 'email', Required: 'NO', Description: 'Customer email address', Example: 'juan@example.com' },
            { Field: 'status', Required: 'NO', Description: 'Status: active, inactive, blocked, vip', Example: 'active' },
            { Field: 'segment', Required: 'NO', Description: 'Segment: vip, regular, new, inactive', Example: 'regular' },
            { Field: 'source', Required: 'NO', Description: 'Source: whatsapp, referral, website, social_media, other', Example: 'whatsapp' },
            { Field: 'tags', Required: 'NO', Description: 'Tags separated by semicolon', Example: 'vip;premium' },
            { Field: 'alternativePhones', Required: 'NO', Description: 'Alternative phone numbers separated by semicolon', Example: '529991234568;529991234569' },
            { Field: 'address_street', Required: 'NO', Description: 'Street address', Example: 'Calle Principal 123' },
            { Field: 'address_city', Required: 'NO', Description: 'City', Example: 'Mérida' },
            { Field: 'address_state', Required: 'NO', Description: 'State/Province', Example: 'Yucatán' },
            { Field: 'address_country', Required: 'NO', Description: 'Country', Example: 'México' },
            { Field: 'address_postalCode', Required: 'NO', Description: 'Postal code', Example: '97000' },
            { Field: 'notes', Required: 'NO', Description: 'Additional notes about the customer', Example: 'Cliente preferente' }
        ];

        // Create workbook
        const workbook = XLSX.utils.book_new();

        // Add instructions sheet
        const instructionsSheet = XLSX.utils.json_to_sheet(instructions);
        instructionsSheet['!cols'] = [
            { wch: 20 },
            { wch: 10 },
            { wch: 50 },
            { wch: 30 }
        ];
        XLSX.utils.book_append_sheet(workbook, instructionsSheet, 'Instructions');

        // Add sample data sheet
        const sampleSheet = XLSX.utils.json_to_sheet(sampleData);
        sampleSheet['!cols'] = [
            { wch: 15 }, { wch: 15 }, { wch: 15 }, { wch: 25 }, { wch: 10 },
            { wch: 10 }, { wch: 12 }, { wch: 20 }, { wch: 20 }, { wch: 30 },
            { wch: 15 }, { wch: 15 }, { wch: 10 }, { wch: 10 }, { wch: 40 }
        ];
        XLSX.utils.book_append_sheet(workbook, sampleSheet, 'Sample Data');

        // Add empty template sheet for users to fill
        const templateSheet = XLSX.utils.json_to_sheet([{
            phoneNumber: '',
            firstName: '',
            lastName: '',
            email: '',
            status: '',
            segment: '',
            source: '',
            tags: '',
            alternativePhones: '',
            address_street: '',
            address_city: '',
            address_state: '',
            address_country: '',
            address_postalCode: '',
            notes: ''
        }]);
        templateSheet['!cols'] = sampleSheet['!cols'];
        XLSX.utils.book_append_sheet(workbook, templateSheet, 'Import Template');

        // Generate buffer and send file with proper encoding
        const buffer = XLSX.write(workbook, { 
            type: 'buffer', 
            bookType: 'xlsx',
            bookSST: false
        });
        res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet; charset=utf-8');
        res.setHeader('Content-Disposition', 'attachment; filename=customer_import_template.xlsx');
        return res.send(buffer);
    } catch (error) {
        console.error('Download template error:', error);
        return res.status(500).json({
            success: false,
            error: error.message
        });
    }
}

module.exports = {
    listCustomers,
    getCustomer,
    createCustomer,
    updateCustomer,
    updateCustomerTags,
    toggleBlockCustomer,
    deleteCustomer,
    reactivateCustomer,
    getCustomerConversations,
    getCustomerStats,
    bulkImportCustomers,
    exportCustomers,
    downloadImportTemplate
};
