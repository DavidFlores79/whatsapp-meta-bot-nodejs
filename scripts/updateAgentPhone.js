#!/usr/bin/env node

/**
 * Quick script to update a specific agent's phone number
 * Usage: node scripts/updateAgentPhone.js <email> <phoneNumber>
 * Example: node scripts/updateAgentPhone.js admin@luxfree.com 5219991234567
 */

const mongoose = require('mongoose');
require('dotenv').config();

const Agent = require('../src/models/Agent');
const { formatNumber } = require('../src/shared/processMessage');

const [,, email, phoneNumber] = process.argv;

if (!email || !phoneNumber) {
    console.log(`
📋 Usage:
  node scripts/updateAgentPhone.js <email> <phoneNumber>

Example:
  node scripts/updateAgentPhone.js admin@luxfree.com 5219991234567

Note: Phone numbers will be automatically formatted to 12 digits if provided in 13-digit format.
    `);
    process.exit(1);
}

async function updatePhone() {
    try {
        // Connect to MongoDB
        await mongoose.connect(process.env.MONGODB);
        console.log('✅ Connected to MongoDB\n');

        // Find agent
        const agent = await Agent.findOne({ email });

        if (!agent) {
            console.log(`❌ Agent not found: ${email}`);
            process.exit(1);
        }

        console.log(`👤 Agent found: ${agent.firstName} ${agent.lastName}`);
        console.log(`   Email: ${agent.email}`);
        console.log(`   Current phone: ${agent.phoneNumber || 'NOT SET'}\n`);

        // Format phone number
        let formattedPhone = phoneNumber.replace(/[\s\-()]/g, ''); // Remove formatting
        if (formattedPhone.length === 13) {
            formattedPhone = formatNumber(formattedPhone);
            console.log(`📞 Formatted phone from 13 to 12 digits: ${formattedPhone}`);
        } else {
            console.log(`📞 Using phone as-is: ${formattedPhone}`);
        }

        // Update agent
        agent.phoneNumber = formattedPhone;
        await agent.save();

        console.log(`\n✅ Successfully updated phone number for ${agent.email}`);
        console.log(`   New phone: ${formattedPhone}`);
        console.log(`\n🎉 Agent will now receive WhatsApp notifications when assigned conversations!`);

    } catch (error) {
        console.error('❌ Error:', error.message);
    } finally {
        await mongoose.connection.close();
        console.log('\n👋 Disconnected from MongoDB');
    }
}

updatePhone();
