#!/usr/bin/env node

/**
 * Migration Script: Add Phone Numbers to Existing Agents
 * 
 * This script handles the migration for making phoneNumber a required field
 * in the Agent model. It provides two modes:
 * 
 * 1. Interactive mode: Prompts admin to enter phone numbers for each agent
 * 2. Placeholder mode: Sets a placeholder phone number for all agents
 * 
 * Usage:
 *   node scripts/migrateAgentPhoneNumbers.js --interactive
 *   node scripts/migrateAgentPhoneNumbers.js --placeholder
 *   node scripts/migrateAgentPhoneNumbers.js --check  (check only, no changes)
 */

const mongoose = require('mongoose');
const readline = require('readline');
require('dotenv').config();

const Agent = require('../src/models/Agent');

const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
});

// Parse command line arguments
const args = process.argv.slice(2);
const mode = args[0];

if (!mode || !['-i', '--interactive', '-p', '--placeholder', '-c', '--check'].includes(mode)) {
    console.log(`
📋 Usage:
  node scripts/migrateAgentPhoneNumbers.js --interactive   # Enter phone numbers manually
  node scripts/migrateAgentPhoneNumbers.js --placeholder   # Set placeholder numbers
  node scripts/migrateAgentPhoneNumbers.js --check         # Check agents without phone numbers
    `);
    process.exit(1);
}

/**
 * Connect to MongoDB
 */
async function connectDB() {
    try {
        await mongoose.connect(process.env.MONGODB);
        console.log('✅ Connected to MongoDB');
    } catch (error) {
        console.error('❌ MongoDB connection error:', error);
        process.exit(1);
    }
}

/**
 * Prompt user for input
 */
function question(query) {
    return new Promise(resolve => {
        rl.question(query, resolve);
    });
}

/**
 * Validate phone number format
 */
function validatePhoneNumber(phone) {
    // Remove spaces, dashes, parentheses
    const cleaned = phone.replace(/[\s\-()]/g, '');
    // Check if it's 10-15 digits
    return /^\d{10,15}$/.test(cleaned);
}

/**
 * Check agents without phone numbers
 */
async function checkAgents() {
    const agentsWithoutPhone = await Agent.find({
        $or: [
            { phoneNumber: { $exists: false } },
            { phoneNumber: null },
            { phoneNumber: '' }
        ]
    }).select('email firstName lastName role isActive');

    console.log(`\n📊 Agents without phone numbers: ${agentsWithoutPhone.length}\n`);

    if (agentsWithoutPhone.length === 0) {
        console.log('✅ All agents have phone numbers configured!');
        return [];
    }

    agentsWithoutPhone.forEach((agent, index) => {
        console.log(`${index + 1}. ${agent.firstName} ${agent.lastName} (${agent.email})`);
        console.log(`   Role: ${agent.role} | Active: ${agent.isActive ? 'Yes' : 'No'}`);
    });

    return agentsWithoutPhone;
}

/**
 * Interactive mode - prompt for each agent's phone number
 */
async function interactiveMigration() {
    console.log('\n🔄 Starting interactive migration...\n');

    const agents = await checkAgents();
    
    if (agents.length === 0) {
        return;
    }

    console.log('\n📝 Please enter phone numbers for each agent.');
    console.log('   Format: Country code + number (e.g., 529991234567 for Mexico)');
    console.log('   Type "skip" to skip an agent\n');

    let updated = 0;
    let skipped = 0;

    for (const agent of agents) {
        console.log(`\n👤 ${agent.firstName} ${agent.lastName} (${agent.email})`);
        
        let phoneNumber = '';
        let isValid = false;

        while (!isValid) {
            phoneNumber = await question('   Enter phone number (or "skip"): ');
            
            if (phoneNumber.toLowerCase() === 'skip') {
                console.log('   ⏭️  Skipped');
                skipped++;
                break;
            }

            if (validatePhoneNumber(phoneNumber)) {
                isValid = true;
                // Remove formatting for storage
                phoneNumber = phoneNumber.replace(/[\s\-()]/g, '');
                
                try {
                    await Agent.findByIdAndUpdate(agent._id, { phoneNumber });
                    console.log(`   ✅ Updated with phone number: ${phoneNumber}`);
                    updated++;
                } catch (error) {
                    console.error(`   ❌ Error updating agent: ${error.message}`);
                }
            } else {
                console.log('   ❌ Invalid phone number. Must be 10-15 digits.');
            }
        }
    }

    console.log(`\n📊 Migration Summary:`);
    console.log(`   ✅ Updated: ${updated}`);
    console.log(`   ⏭️  Skipped: ${skipped}`);
    console.log(`   📋 Total: ${agents.length}`);

    if (skipped > 0) {
        console.log(`\n⚠️  Warning: ${skipped} agent(s) still need phone numbers!`);
        console.log('   These agents will NOT receive WhatsApp notifications.');
    }
}

/**
 * Placeholder mode - set a default placeholder number
 */
async function placeholderMigration() {
    console.log('\n🔄 Starting placeholder migration...\n');

    const agents = await checkAgents();
    
    if (agents.length === 0) {
        return;
    }

    console.log('\n⚠️  WARNING: This will set a placeholder phone number for all agents.');
    console.log('   Placeholder format: 52999000000X (where X is unique per agent)');
    console.log('   These numbers are NOT real and CANNOT receive WhatsApp messages.\n');

    const confirm = await question('Continue? (yes/no): ');
    
    if (confirm.toLowerCase() !== 'yes') {
        console.log('❌ Migration cancelled');
        return;
    }

    let updated = 0;
    const baseNumber = '5299900000';

    for (let i = 0; i < agents.length; i++) {
        const agent = agents[i];
        const placeholderNumber = `${baseNumber}${String(i).padStart(2, '0')}`;
        
        try {
            await Agent.findByIdAndUpdate(agent._id, { phoneNumber: placeholderNumber });
            console.log(`✅ ${agent.email} → ${placeholderNumber}`);
            updated++;
        } catch (error) {
            console.error(`❌ Error updating ${agent.email}: ${error.message}`);
        }
    }

    console.log(`\n📊 Migration Summary:`);
    console.log(`   ✅ Updated: ${updated} agents with placeholder numbers`);
    console.log(`\n⚠️  IMPORTANT: Update these placeholder numbers with real phone numbers ASAP!`);
    console.log('   Agents can update their own numbers via Profile → Settings');
}

/**
 * Main execution
 */
async function main() {
    try {
        await connectDB();

        switch (mode) {
            case '-c':
            case '--check':
                await checkAgents();
                break;
            
            case '-i':
            case '--interactive':
                await interactiveMigration();
                break;
            
            case '-p':
            case '--placeholder':
                await placeholderMigration();
                break;
        }

    } catch (error) {
        console.error('❌ Migration error:', error);
    } finally {
        rl.close();
        await mongoose.connection.close();
        console.log('\n👋 Disconnected from MongoDB');
    }
}

// Run the script
main();
