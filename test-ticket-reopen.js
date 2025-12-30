/**
 * Test script for ticket reopening functionality
 * Tests:
 * 1. Finding recently resolved tickets
 * 2. Reopening a resolved ticket
 * 3. Configuration settings
 */

require('dotenv').config();
const mongoose = require('mongoose');
const ticketService = require('./src/services/ticketService');
const configService = require('./src/services/configurationService');
const Customer = require('./src/models/Customer');
const Agent = require('./src/models/Agent'); // Required for populate

async function testTicketReopening() {
    try {
        // Connect to MongoDB
        await mongoose.connect(process.env.MONGODB);
        console.log('✅ Connected to MongoDB\n');

        // Test 1: Get configuration
        console.log('=== TEST 1: Check Ticket Behavior Configuration ===');
        const behavior = await configService.getTicketBehavior();
        console.log('Auto-reopen window:', behavior.autoReopenWindowHours, 'hours');
        console.log('Allow reopen closed:', behavior.allowReopenClosed);
        console.log('Allow reopen escalated:', behavior.allowReopenEscalated);
        console.log('Max reopen count:', behavior.maxReopenCount);
        console.log('');

        // Test 2: Find a customer with resolved tickets
        console.log('=== TEST 2: Find Customer with Resolved Tickets ===');
        const customer = await Customer.findOne({ phoneNumber: '529991992696' });
        if (!customer) {
            console.log('❌ Test customer not found');
            return;
        }
        console.log('Customer:', customer.firstName, customer.lastName);
        console.log('Customer ID:', customer._id);
        console.log('');

        // Test 3: Check for recent resolved tickets
        console.log('=== TEST 3: Find Recent Resolved Ticket ===');
        const recentTicket = await ticketService.findRecentResolvedTicket(customer._id);
        if (recentTicket) {
            console.log('✅ Found recent resolved ticket:');
            console.log('  Ticket ID:', recentTicket.ticketId);
            console.log('  Status:', recentTicket.status);
            console.log('  Resolved at:', recentTicket.resolution?.resolvedAt);
            console.log('  Reopen count:', recentTicket.reopenCount || 0);
            console.log('  Assigned to:', recentTicket.assignedAgent?.firstName, recentTicket.assignedAgent?.lastName);
            console.log('');

            // Test 4: Reopen the ticket
            console.log('=== TEST 4: Reopen Ticket ===');
            const reopenedTicket = await ticketService.reopenTicket(
                recentTicket.ticketId,
                'Testing ticket reopening functionality'
            );
            console.log('✅ Ticket reopened successfully:');
            console.log('  Ticket ID:', reopenedTicket.ticketId);
            console.log('  New status:', reopenedTicket.status);
            console.log('  Reopen count:', reopenedTicket.reopenCount);
            console.log('  Last reopened at:', reopenedTicket.lastReopenedAt);
            console.log('');

            // Test 5: Verify status history
            console.log('=== TEST 5: Status History ===');
            const lastHistory = reopenedTicket.statusHistory[reopenedTicket.statusHistory.length - 1];
            console.log('  From:', lastHistory.from);
            console.log('  To:', lastHistory.to);
            console.log('  Reason:', lastHistory.reason);
            console.log('  Changed at:', lastHistory.changedAt);
            console.log('');
        } else {
            console.log('ℹ️  No recent resolved ticket found within the configured window');
            console.log('   This is expected if no tickets were resolved in the last', behavior.autoReopenWindowHours, 'hours');
            console.log('');
        }

        console.log('✅ All tests completed successfully!');

    } catch (error) {
        console.error('❌ Test failed:', error);
    } finally {
        await mongoose.connection.close();
        console.log('\n✅ Database connection closed');
    }
}

testTicketReopening();
