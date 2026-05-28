/**
 * Script to enable order creation feature in EcommerceConfig
 * Run: node enable-order-creation.js
 */
require('dotenv').config();
const mongoose = require('mongoose');

async function enableOrderCreation() {
    try {
        // Connect to MongoDB
        const mongoUri = process.env.MONGODB;
        if (!mongoUri) {
            console.error('❌ MONGODB environment variable not set');
            process.exit(1);
        }

        console.log('🔌 Connecting to MongoDB...');
        await mongoose.connect(mongoUri);
        console.log('✅ Connected to MongoDB');

        // Get EcommerceConfig model
        const EcommerceConfig = require('./src/models/EcommerceConfig');
        
        // Find the default config
        let config = await EcommerceConfig.getDefault();
        
        if (!config) {
            console.log('❌ No EcommerceConfig found. Please configure e-commerce integration first.');
            process.exit(1);
        }

        console.log('\n📋 Current features configuration:');
        console.log(JSON.stringify(config.features, null, 2));

        // Check if already enabled
        if (config.features.orderCreate === true) {
            console.log('\n✅ Order creation is already enabled!');
            process.exit(0);
        }

        // Enable orderCreate feature
        config.features.orderCreate = true;
        await config.save();

        console.log('\n✅ Order creation feature has been ENABLED!');
        console.log('\n📋 Updated features configuration:');
        console.log(JSON.stringify(config.features, null, 2));

        console.log('\n⚠️  IMPORTANT: Restart your server to apply changes.');
        console.log('   Run: pm2 restart whatsapp');

    } catch (error) {
        console.error('❌ Error:', error.message);
        process.exit(1);
    } finally {
        await mongoose.disconnect();
        console.log('\n🔌 Disconnected from MongoDB');
    }
}

enableOrderCreation();
