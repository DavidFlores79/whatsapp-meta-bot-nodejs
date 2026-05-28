/**
 * Check agent assignment notification template structure
 * Run with: node check-template.js
 */

require('dotenv').config();
const mongoose = require('mongoose');
const Template = require('./src/models/Template');

async function checkTemplates() {
    try {
        await mongoose.connect(process.env.MONGODB);
        console.log('✅ Connected to MongoDB\n');

        const templates = await Template.find({
            name: {
                $in: ['agent_assignment_notification_en', 'agent_assignment_notification_es']
            }
        });

        console.log(`Found ${templates.length} templates:\n`);

        templates.forEach(template => {
            console.log(`Template: ${template.name}`);
            console.log(`Language: ${template.language}`);
            console.log(`Status: ${template.status}`);
            console.log(`Category: ${template.category}`);
            console.log('\nComponents:');

            template.components.forEach((comp, idx) => {
                console.log(`\n  Component ${idx + 1}:`);
                console.log(`    Type: ${comp.type}`);
                if (comp.text) console.log(`    Text: ${comp.text}`);
                if (comp.format) console.log(`    Format: ${comp.format}`);
                if (comp.parameters && comp.parameters.length > 0) {
                    console.log(`    Parameters (${comp.parameters.length}):`);
                    comp.parameters.forEach((param, pIdx) => {
                        console.log(`      ${pIdx + 1}. Type: ${param.type}, Text: ${param.text || 'N/A'}`);
                    });
                }
            });

            console.log('\n' + '='.repeat(60) + '\n');
        });

        await mongoose.disconnect();
        process.exit(0);
    } catch (error) {
        console.error('❌ Error:', error.message);
        process.exit(1);
    }
}

checkTemplates();
