/**
 * Check Agent Language Script
 * 
 * Check and optionally update agent's language preference
 */

require('dotenv').config();
const mongoose = require('mongoose');
const Agent = require('../src/models/Agent');

async function checkAgentLanguage() {
    try {
        await mongoose.connect(process.env.MONGODB);
        console.log('✅ Connected to MongoDB\n');

        // Get all agents
        const agents = await Agent.find({});
        console.log(`📊 Total agents: ${agents.length}\n`);

        for (const agent of agents) {
            console.log(`👤 Agent: ${agent.email}`);
            console.log(`   Name: ${agent.firstName} ${agent.lastName}`);
            console.log(`   Languages: ${agent.languages || 'NOT SET'}`);
            console.log(`   Languages Array: ${JSON.stringify(agent.languages)}`);
            
            // If language is not set, default to Spanish
            if (!agent.languages || agent.languages.length === 0) {
                console.log(`   ⚠️  No language preference set, updating to Spanish...`);
                agent.languages = ['es'];
                await agent.save();
                console.log(`   ✅ Updated to Spanish (es)`);
            }
            console.log('');
        }

        console.log('\n✅ Language check complete!');

    } catch (error) {
        console.error('❌ Error:', error);
    } finally {
        await mongoose.disconnect();
        console.log('✅ Disconnected from MongoDB');
        process.exit(0);
    }
}

checkAgentLanguage();
