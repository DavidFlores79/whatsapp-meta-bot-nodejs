/**
 * Migration Script: Add businessType field to existing tickets
 * 
 * This script adds business type isolation to the universal ticket system
 * by analyzing existing ticket categories and mapping them to their
 * corresponding business types (luxfree, ecommerce, restaurant, healthcare)
 * 
 * Run with: node scripts/add-business-type-field.js
 */

require('dotenv').config();
const mongoose = require('mongoose');
const Ticket = require('../src/models/Ticket');
const configService = require('../src/services/configurationService');

/**
 * Build category-to-business-type mapping
 */
async function buildCategoryMap() {
    const presets = await configService.getConfigurationPresets();
    const categoryMap = {};
    
    presets.forEach(preset => {
        const categories = preset.config.ticket_categories;
        categories.forEach(cat => {
            categoryMap[cat.id] = {
                businessType: preset.id,
                presetName: preset.name,
                assistantName: preset.config.assistant_configuration.assistantName,
                companyName: preset.config.assistant_configuration.companyName
            };
        });
    });
    
    return categoryMap;
}

/**
 * Migrate existing tickets to include businessType
 */
async function migrateTickets() {
    console.log('🔄 Starting business type migration...\n');
    
    try {
        // Connect to MongoDB
        await mongoose.connect(process.env.MONGODB, {
            useNewUrlParser: true,
            useUnifiedTopology: true
        });
        console.log('✅ Connected to MongoDB\n');
        
        // Build category mapping
        const categoryMap = await buildCategoryMap();
        console.log('📋 Category-to-BusinessType mapping:');
        console.table(
            Object.entries(categoryMap).map(([cat, info]) => ({
                Category: cat,
                BusinessType: info.businessType,
                PresetName: info.presetName
            }))
        );
        console.log('');
        
        // Find tickets without businessType field
        const ticketsToMigrate = await Ticket.find({
            $or: [
                { businessType: { $exists: false } },
                { businessType: null }
            ]
        });
        
        console.log(`📊 Found ${ticketsToMigrate.length} tickets to migrate\n`);
        
        if (ticketsToMigrate.length === 0) {
            console.log('✅ No tickets to migrate. All tickets already have businessType field.');
            await mongoose.connection.close();
            return;
        }
        
        // Migrate each ticket
        let successCount = 0;
        let unmappedCount = 0;
        const unmappedCategories = new Set();
        
        for (const ticket of ticketsToMigrate) {
            const categoryInfo = categoryMap[ticket.category];
            
            if (categoryInfo) {
                // Map to business type
                ticket.businessType = categoryInfo.businessType;
                
                // Store preset snapshot for audit trail
                ticket.presetSnapshot = {
                    presetId: categoryInfo.businessType,
                    assistantName: categoryInfo.assistantName,
                    companyName: categoryInfo.companyName
                };
                
                await ticket.save();
                successCount++;
                
                console.log(`✅ ${ticket.ticketId} → ${categoryInfo.businessType} (${ticket.category})`);
            } else {
                // Category not found in any preset - default to luxfree
                ticket.businessType = 'luxfree';
                
                // Store minimal snapshot
                ticket.presetSnapshot = {
                    presetId: 'luxfree',
                    assistantName: 'Lúmen',
                    companyName: process.env.COMPANY_NAME || 'LUXFREE'
                };
                
                await ticket.save();
                unmappedCount++;
                unmappedCategories.add(ticket.category);
                
                console.warn(`⚠️  ${ticket.ticketId} → luxfree (unmapped category: ${ticket.category})`);
            }
        }
        
        console.log('\n' + '═'.repeat(60));
        console.log('📊 MIGRATION SUMMARY');
        console.log('═'.repeat(60));
        console.log(`✅ Successfully migrated: ${successCount} tickets`);
        console.log(`⚠️  Defaulted to luxfree:  ${unmappedCount} tickets`);
        console.log(`📦 Total processed:       ${ticketsToMigrate.length} tickets`);
        
        if (unmappedCategories.size > 0) {
            console.log('\n⚠️  Unmapped categories (defaulted to luxfree):');
            unmappedCategories.forEach(cat => console.log(`   - ${cat}`));
            console.log('\nℹ️  Review these categories and update manually if needed.');
        }
        
        console.log('\n✅ Migration completed successfully!');
        
        // Create indexes for efficient queries
        console.log('\n🔍 Creating database indexes...');
        await Ticket.collection.createIndex({ businessType: 1 });
        await Ticket.collection.createIndex({ customerId: 1, businessType: 1 });
        await Ticket.collection.createIndex({ businessType: 1, status: 1 });
        console.log('✅ Indexes created');
        
    } catch (error) {
        console.error('\n❌ Migration failed:', error);
        throw error;
    } finally {
        await mongoose.connection.close();
        console.log('\n🔌 Disconnected from MongoDB');
    }
}

/**
 * Verification function - check migration results
 */
async function verifyMigration() {
    console.log('\n' + '═'.repeat(60));
    console.log('🔍 VERIFICATION');
    console.log('═'.repeat(60));
    
    await mongoose.connect(process.env.MONGODB, {
        useNewUrlParser: true,
        useUnifiedTopology: true
    });
    
    // Count tickets by business type
    const businessTypes = ['luxfree', 'restaurant', 'ecommerce', 'healthcare', 'custom'];
    
    console.log('\n📊 Tickets by Business Type:');
    for (const businessType of businessTypes) {
        const count = await Ticket.countDocuments({ businessType });
        if (count > 0) {
            console.log(`   ${businessType.padEnd(15)} ${count} tickets`);
        }
    }
    
    // Check for tickets without businessType
    const unmigrated = await Ticket.countDocuments({
        $or: [
            { businessType: { $exists: false } },
            { businessType: null }
        ]
    });
    
    console.log(`\n❓ Tickets without businessType: ${unmigrated}`);
    
    if (unmigrated === 0) {
        console.log('✅ All tickets have been migrated successfully!');
    } else {
        console.log('⚠️  Some tickets still need migration');
    }
    
    await mongoose.connection.close();
}

// Main execution
(async () => {
    try {
        await migrateTickets();
        await verifyMigration();
        process.exit(0);
    } catch (error) {
        console.error('\n❌ Fatal error:', error);
        process.exit(1);
    }
})();
