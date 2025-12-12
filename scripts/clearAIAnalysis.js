/**
 * Clear AI Analysis Script
 * 
 * Clears existing AI analysis from AgentAssignmentHistory to allow regeneration
 */

require('dotenv').config();
const mongoose = require('mongoose');
const AgentAssignmentHistory = require('../src/models/AgentAssignmentHistory');

async function clearAIAnalysis() {
    try {
        await mongoose.connect(process.env.MONGODB);
        console.log('✅ Connected to MongoDB\n');

        // Count records with AI analysis
        const recordsWithAnalysis = await AgentAssignmentHistory.countDocuments({
            aiAnalysis: { $exists: true, $ne: null }
        });

        console.log(`📊 Found ${recordsWithAnalysis} records with AI analysis`);

        if (recordsWithAnalysis === 0) {
            console.log('✅ No AI analysis to clear!');
            return;
        }

        // Ask for confirmation (in production, you'd use readline or similar)
        console.log('\n⚠️  This will clear all AI analysis data!');
        console.log('   New analysis will be generated when conversations are released.\n');

        // Clear the AI analysis field
        const result = await AgentAssignmentHistory.updateMany(
            { aiAnalysis: { $exists: true } },
            { $unset: { aiAnalysis: "" } }
        );

        console.log(`✅ Cleared AI analysis from ${result.modifiedCount} records`);
        console.log('\n📝 Next steps:');
        console.log('   1. Ensure agent language is set correctly (run checkAgentLanguage.js)');
        console.log('   2. Release a conversation from the CRM');
        console.log('   3. Check Reports - new analysis will be in the configured language');

    } catch (error) {
        console.error('❌ Error:', error);
    } finally {
        await mongoose.disconnect();
        console.log('\n✅ Disconnected from MongoDB');
        process.exit(0);
    }
}

clearAIAnalysis();
