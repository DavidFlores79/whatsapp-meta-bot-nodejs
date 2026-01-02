/**
 * Script to update assistant instructions in database
 * Run with: node update-instructions.js
 */

require('dotenv').config();
const mongoose = require('mongoose');
const SystemSettings = require('./src/models/SystemSettings');
const configService = require('./src/services/configurationService');

async function updateInstructions() {
    try {
        console.log('🔌 Connecting to MongoDB...');
        await mongoose.connect(process.env.MONGODB);
        console.log('✅ Connected to MongoDB');

        console.log('\n📝 Current assistant instructions:');
        const currentInstructions = await SystemSettings.getSetting('assistant_instructions_template');

        if (currentInstructions) {
            console.log(`   Length: ${currentInstructions.length} characters`);
            console.log(`   Contains "reopened" keyword: ${currentInstructions.includes('reopened') ? 'YES ✅' : 'NO ❌'}`);
        } else {
            console.log('   ⚠️  No instructions found in database');
        }

        console.log('\n🔄 Updating assistant instructions with reopening logic...');

        // Get the new default instructions
        const newInstructions = configService.getDefaultInstructionsTemplate();

        // Update in database
        await SystemSettings.updateSetting(
            'assistant_instructions_template',
            newInstructions,
            null // system update, no agent
        );

        console.log('✅ Assistant instructions updated successfully!');
        console.log(`   New length: ${newInstructions.length} characters`);
        console.log(`   Contains "reopened" keyword: ${newInstructions.includes('reopened') ? 'YES ✅' : 'NO ❌'}`);
        console.log(`   Contains "CHECK THE 'reopened' FIELD": ${newInstructions.includes("CHECK THE 'reopened' FIELD") ? 'YES ✅' : 'NO ❌'}`);

        console.log('\n📊 Updated instructions preview (reopening section):');
        const startIdx = newInstructions.indexOf("CRITICAL: CHECK THE 'reopened' FIELD");
        if (startIdx !== -1) {
            const excerpt = newInstructions.substring(startIdx, startIdx + 400);
            console.log('---');
            console.log(excerpt + '...');
            console.log('---');
        }

        console.log('\n✨ Done! The AI will now properly handle ticket reopening.');
        console.log('💡 Test it by:');
        console.log('   1. Create and resolve a ticket');
        console.log('   2. Report the same issue again within 72 hours');
        console.log('   3. AI should say "He reabierto tu reporte anterior"');

        process.exit(0);
    } catch (error) {
        console.error('❌ Error updating instructions:', error);
        process.exit(1);
    }
}

updateInstructions();
