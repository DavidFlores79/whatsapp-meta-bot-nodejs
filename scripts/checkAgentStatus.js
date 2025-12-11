/**
 * Check Agent Status Script
 * 
 * Verify agent status and availability for auto-assignment
 */

require('dotenv').config();
const mongoose = require('mongoose');
const Agent = require('../src/models/Agent');

async function checkAgentStatus() {
    try {
        await mongoose.connect(process.env.MONGODB);
        console.log('✅ Connected to MongoDB\n');

        // Get all agents
        const allAgents = await Agent.find({});
        console.log(`📊 Total agents in database: ${allAgents.length}\n`);

        // Check each agent
        for (const agent of allAgents) {
            console.log(`\n👤 Agent: ${agent.email}`);
            console.log(`   Status: ${agent.status}`);
            console.log(`   Active: ${agent.isActive}`);
            console.log(`   Auto-Assign: ${agent.autoAssign || false}`);
            console.log(`   Active Chats: ${agent.statistics.activeAssignments || 0}`);
            console.log(`   Max Concurrent: ${agent.maxConcurrentChats || 20}`);
            console.log(`   Last Activity: ${agent.lastActivity || 'Never'}`);
            
            const isAvailable = agent.isActive && 
                               ['online', 'away'].includes(agent.status) &&
                               (agent.statistics.activeAssignments || 0) < (agent.maxConcurrentChats || 20);
            
            console.log(`   ✓ Available for assignment: ${isAvailable ? '✅ YES' : '❌ NO'}`);
            
            if (!isAvailable) {
                console.log(`   Reason:`);
                if (!agent.isActive) console.log(`     - Not active`);
                if (!['online', 'away'].includes(agent.status)) console.log(`     - Status is '${agent.status}' (needs 'online' or 'away')`);
                if ((agent.statistics.activeAssignments || 0) >= (agent.maxConcurrentChats || 20)) {
                    console.log(`     - At capacity (${agent.statistics.activeAssignments}/${agent.maxConcurrentChats})`);
                }
            }
        }

        console.log('\n\n📋 SUMMARY:');
        const availableAgents = allAgents.filter(a => 
            a.isActive && 
            ['online', 'away'].includes(a.status) &&
            (a.statistics.activeAssignments || 0) < (a.maxConcurrentChats || 20)
        );
        console.log(`✅ Available agents: ${availableAgents.length}`);
        console.log(`   Emails: ${availableAgents.map(a => a.email).join(', ') || 'none'}`);

        const autoAssignAgents = availableAgents.filter(a => a.autoAssign);
        console.log(`🤖 With auto-assign enabled: ${autoAssignAgents.length}`);
        console.log(`   Emails: ${autoAssignAgents.map(a => a.email).join(', ') || 'none'}`);

        if (availableAgents.length === 0) {
            console.log('\n⚠️  WARNING: No agents available for assignment!');
            console.log('   Solutions:');
            console.log('   1. Set agent status to "online" or "away"');
            console.log('   2. Ensure agent isActive = true');
            console.log('   3. Check agent is not at max capacity');
        }

    } catch (error) {
        console.error('❌ Error:', error);
    } finally {
        await mongoose.disconnect();
        console.log('\n✅ Disconnected from MongoDB');
        process.exit(0);
    }
}

checkAgentStatus();
