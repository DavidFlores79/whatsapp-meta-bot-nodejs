#!/usr/bin/env node

/**
 * Check agent's phone number in database
 * Usage: node scripts/checkAgentPhone.js <email>
 */

const mongoose = require('mongoose');
require('dotenv').config();

const Agent = require('../src/models/Agent');

const [,, email] = process.argv;

if (!email) {
    console.log(`
📋 Usage:
  node scripts/checkAgentPhone.js <email>

Example:
  node scripts/checkAgentPhone.js admin@luxfree.com
    `);
    process.exit(1);
}

async function checkPhone() {
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

        console.log('========================================');
        console.log('👤 AGENT DETAILS');
        console.log('========================================');
        console.log(`Name:     ${agent.firstName} ${agent.lastName}`);
        console.log(`Email:    ${agent.email}`);
        console.log(`Role:     ${agent.role}`);
        console.log(`Status:   ${agent.status}`);
        console.log(`Active:   ${agent.isActive ? 'Yes' : 'No'}`);
        console.log('----------------------------------------');
        console.log(`Phone:    ${agent.phoneNumber || '❌ NOT SET'}`);
        console.log('========================================\n');

        if (!agent.phoneNumber) {
            console.log('⚠️  WARNING: No phone number configured!');
            console.log('   This agent CANNOT receive WhatsApp notifications.\n');
            console.log('💡 To fix this, run:');
            console.log(`   node scripts/updateAgentPhone.js ${email} <phone-number>`);
        } else {
            console.log('✅ Phone number is configured');
            console.log(`   Format: ${agent.phoneNumber.length} digits`);
            console.log(`   Expected: 12 digits (e.g., 529991234567)\n`);

            if (agent.phoneNumber.length === 12) {
                console.log('✅ Phone number format is CORRECT');
            } else if (agent.phoneNumber.length === 13) {
                console.log('⚠️  Phone number is 13 digits - should be reformatted to 12');
                console.log('💡 Run this to fix:');
                console.log(`   node scripts/updateAgentPhone.js ${email} ${agent.phoneNumber}`);
            } else {
                console.log(`⚠️  Phone number has ${agent.phoneNumber.length} digits - unusual format`);
            }
        }

    } catch (error) {
        console.error('❌ Error:', error.message);
    } finally {
        await mongoose.connection.close();
        console.log('\n👋 Disconnected from MongoDB');
    }
}

checkPhone();
