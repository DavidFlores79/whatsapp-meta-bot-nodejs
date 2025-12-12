/**
 * Test Performance Query
 * 
 * Test the agent performance query to see what's happening
 */

require('dotenv').config();
const mongoose = require('mongoose');
const AgentAssignmentHistory = require('../src/models/AgentAssignmentHistory');
const Agent = require('../src/models/Agent');

async function testQuery() {
    try {
        await mongoose.connect(process.env.MONGODB);
        console.log('✅ Connected to MongoDB\n');

        // Get the admin agent
        const agent = await Agent.findOne({ email: 'admin@luxfree.com' });
        if (!agent) {
            console.log('❌ Agent not found');
            return;
        }

        console.log('👤 Testing query for agent:', agent.email);
        console.log('   Agent ID:', agent._id);

        // Test the query
        const startDate = new Date('2025-12-01');
        const endDate = new Date('2025-12-15');
        
        const filter = { 
            agentId: agent._id,
            assignedAt: {
                $gte: startDate,
                $lte: endDate
            }
        };

        console.log('\n📊 Query filter:', JSON.stringify(filter, null, 2));

        console.log('\n⏱️  Executing query...');
        const start = Date.now();

        const assignments = await AgentAssignmentHistory.find(filter)
            .select('-contextSummary')
            .sort({ assignedAt: -1 })
            .limit(50)
            .lean();

        const duration = Date.now() - start;

        console.log(`✅ Query completed in ${duration}ms`);
        console.log(`📦 Found ${assignments.length} assignments\n`);

        if (assignments.length > 0) {
            console.log('Sample assignment:');
            const sample = assignments[0];
            console.log('  - ID:', sample._id);
            console.log('  - Assigned At:', sample.assignedAt);
            console.log('  - Released At:', sample.releasedAt);
            console.log('  - Duration:', sample.duration, 'seconds');
            console.log('  - Has AI Analysis:', !!sample.aiAnalysis);
            if (sample.aiAnalysis) {
                console.log('  - Overall Score:', sample.aiAnalysis.agentPerformance?.overallScore);
            }
        } else {
            console.log('⚠️  No assignments found in date range');
            
            // Check if there are ANY assignments for this agent
            const anyAssignments = await AgentAssignmentHistory.countDocuments({ agentId: agent._id });
            console.log(`\nℹ️  Total assignments for this agent (any date): ${anyAssignments}`);
            
            if (anyAssignments > 0) {
                const latestAssignment = await AgentAssignmentHistory.findOne({ agentId: agent._id })
                    .sort({ assignedAt: -1 })
                    .lean();
                console.log('   Latest assignment date:', latestAssignment.assignedAt);
            }
        }

    } catch (error) {
        console.error('❌ Error:', error);
    } finally {
        await mongoose.disconnect();
        console.log('\n✅ Disconnected from MongoDB');
        process.exit(0);
    }
}

testQuery();
