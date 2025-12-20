/**
 * Test script to verify template parameter fix for agent assignment notifications
 * Run with: node test-template-fix.js
 */

require('dotenv').config();
const mongoose = require('mongoose');
const Agent = require('./src/models/Agent');
const Customer = require('./src/models/Customer');
const { sendAssignmentNotification } = require('./src/services/agentNotificationService');

async function testNotification() {
    try {
        await mongoose.connect(process.env.MONGODB);
        console.log('✅ Connected to MongoDB\n');

        // Find the admin agent
        const agent = await Agent.findOne({ email: 'admin@luxfree.com' });
        if (!agent) {
            console.error('❌ Admin agent not found');
            process.exit(1);
        }

        console.log(`Found agent: ${agent.email}`);
        console.log(`Phone: ${agent.phoneNumber}`);
        console.log(`Languages: ${agent.languages?.join(', ') || 'None'}\n`);

        // Find a test customer
        const customer = await Customer.findOne();
        if (!customer) {
            console.error('❌ No customers found in database');
            process.exit(1);
        }

        console.log(`Test customer: ${customer.firstName || 'N/A'}`);
        console.log(`Phone: ${customer.phoneNumber}\n`);

        // Mock conversation with priority
        const mockConversation = {
            priority: 'High'
        };

        console.log('=== Sending Test Notification ===\n');

        // Send notification
        const result = await sendAssignmentNotification(agent, customer, mockConversation);

        if (result) {
            console.log('\n✅ Test notification sent successfully!');
            console.log('Check the agent\'s WhatsApp to verify the message was received.');
        } else {
            console.log('\n⚠️ Notification was not sent (check logs above for details)');
        }

        await mongoose.disconnect();
        process.exit(0);

    } catch (error) {
        console.error('❌ Error:', error.message);
        console.error(error);
        process.exit(1);
    }
}

testNotification();
