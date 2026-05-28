/**
 * Diagnostic script to check why images aren't appearing for ticket LUX-2025-000006
 */

require('dotenv').config();
const mongoose = require('mongoose');
const Ticket = require('./src/models/Ticket');
const Message = require('./src/models/Message');
const Conversation = require('./src/models/Conversation');
const Customer = require('./src/models/Customer');
const SystemSettings = require('./src/models/SystemSettings');

async function checkTicketImages() {
    try {
        await mongoose.connect(process.env.MONGODB);
        console.log('✅ Connected to MongoDB\n');

        const ticketId = process.argv[2] || 'LUX-2025-000006';
        
        // 1. Find the ticket
        console.log(`🎫 Checking ticket: ${ticketId}`);
        const ticket = await Ticket.findOne({ ticketId }).populate('conversationId').populate('customerId');
        
        if (!ticket) {
            console.log('❌ Ticket not found');
            process.exit(1);
        }

        console.log(`✅ Found ticket: ${ticket._id}`);
        console.log(`   Customer: ${ticket.customerId?.firstName} ${ticket.customerId?.lastName}`);
        console.log(`   Phone: ${ticket.customerId?.phoneNumber}`);
        console.log(`   Conversation ID: ${ticket.conversationId?._id || 'None'}`);
        console.log(`   Current attachments: ${ticket.attachments?.length || 0}`);
        console.log(`   Created: ${ticket.createdAt}`);
        console.log('');

        if (!ticket.conversationId) {
            console.log('❌ Ticket has no conversation linked');
            process.exit(1);
        }

        // 2. Get configuration for time limit
        const ticketBehaviorSetting = await SystemSettings.findOne({ key: 'ticket_behavior' });
        const hoursLimit = ticketBehaviorSetting?.value?.attachmentHoursLimit || 48;
        
        const cutoffDate = new Date();
        cutoffDate.setHours(cutoffDate.getHours() - hoursLimit);
        
        console.log(`⏰ Looking for messages after: ${cutoffDate.toISOString()}`);
        console.log(`   (Last ${hoursLimit} hours)\n`);

        // 3. Find all messages with attachments in this conversation
        const allMessages = await Message.find({
            conversationId: ticket.conversationId._id,
            'attachments.0': { $exists: true },
            sender: 'customer'
        }).sort({ timestamp: -1 });

        console.log(`📨 Total messages with attachments: ${allMessages.length}`);
        
        allMessages.forEach((msg, idx) => {
            const isRecent = msg.timestamp >= cutoffDate;
            console.log(`   ${idx + 1}. ${msg.timestamp.toISOString()} ${isRecent ? '✅ RECENT' : '❌ TOO OLD'}`);
            console.log(`      Type: ${msg.type}`);
            console.log(`      Content: ${msg.content}`);
            console.log(`      Attachments: ${msg.attachments.length}`);
            msg.attachments.forEach((att, i) => {
                console.log(`         [${i}] ${att.type} - ${att.filename}`);
                console.log(`             URL: ${att.url}`);
            });
        });
        console.log('');

        // 4. Get messages within time window
        const recentMessages = await Message.find({
            conversationId: ticket.conversationId._id,
            'attachments.0': { $exists: true },
            sender: 'customer',
            timestamp: { $gte: cutoffDate }
        }).sort({ timestamp: -1 });

        console.log(`📸 Recent messages (within ${hoursLimit}h): ${recentMessages.length}\n`);

        // 5. Check which messages are already attached to tickets
        const allTickets = await Ticket.find({
            conversationId: ticket.conversationId._id,
            'attachments.0': { $exists: true }
        }).select('ticketId attachments');

        console.log(`🎫 Tickets with attachments in this conversation: ${allTickets.length}`);
        
        const attachedMessageIds = new Set();
        allTickets.forEach(t => {
            console.log(`   ${t.ticketId} has ${t.attachments.length} attachments`);
            (t.attachments || []).forEach(att => {
                if (att.messageId) {
                    attachedMessageIds.add(att.messageId.toString());
                    console.log(`      - Message ${att.messageId} (${att.type})`);
                }
            });
        });
        console.log('');

        // 6. Find available attachments (not yet attached)
        console.log('🔍 Available attachments for ticket:\n');
        const availableAttachments = [];
        
        recentMessages.forEach(msg => {
            const isAttached = attachedMessageIds.has(msg._id.toString());
            console.log(`   Message ${msg._id}: ${isAttached ? '❌ ALREADY ATTACHED' : '✅ AVAILABLE'}`);
            console.log(`      Time: ${msg.timestamp.toISOString()}`);
            console.log(`      Type: ${msg.type}`);
            console.log(`      Content: ${msg.content}`);
            
            if (!isAttached) {
                msg.attachments.forEach(att => {
                    availableAttachments.push({
                        messageId: msg._id,
                        type: att.type,
                        url: att.url,
                        filename: att.filename,
                        timestamp: msg.timestamp
                    });
                });
            }
        });

        console.log(`\n📊 Summary:`);
        console.log(`   Total messages with attachments: ${allMessages.length}`);
        console.log(`   Recent messages (last ${hoursLimit}h): ${recentMessages.length}`);
        console.log(`   Already attached to tickets: ${attachedMessageIds.size}`);
        console.log(`   Available to attach: ${availableAttachments.length}`);

        if (availableAttachments.length === 0) {
            console.log('\n⚠️  No attachments available because:');
            if (recentMessages.length === 0) {
                console.log('   - No messages with attachments found within time window');
                console.log(`   - Check if messages are older than ${hoursLimit} hours`);
            } else if (attachedMessageIds.size === recentMessages.length) {
                console.log('   - All recent attachments are already attached to tickets');
            }
        }

        console.log('');
        
        await mongoose.connection.close();
        console.log('✅ MongoDB connection closed');
        process.exit(0);

    } catch (error) {
        console.error('❌ Error:', error);
        await mongoose.connection.close();
        process.exit(1);
    }
}

checkTicketImages();
