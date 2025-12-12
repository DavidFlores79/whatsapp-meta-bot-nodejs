require('dotenv').config();
const mongoose = require('mongoose');
const Agent = require('../src/models/Agent');
const authService = require('../src/services/authService');

async function createAdminAgent() {
    try {
        // Connect to MongoDB
        await mongoose.connect(process.env.MONGODB, {
            useNewUrlParser: true,
            useUnifiedTopology: true
        });

        console.log('✅ Connected to MongoDB');

        // Check if admin already exists
        const existingAdmin = await Agent.findOne({ email: 'admin@luxfree.com' });
        if (existingAdmin) {
            console.log('⚠️  Admin agent already exists');
            console.log(`   Email: ${existingAdmin.email}`);
            console.log(`   Name: ${existingAdmin.firstName} ${existingAdmin.lastName}`);
            process.exit(0);
        }

        // Create admin agent
        const hashedPassword = await authService.hashPassword('admin123');

        const admin = await Agent.create({
            email: 'admin@luxfree.com',
            password: hashedPassword,
            firstName: 'Admin',
            lastName: 'User',
            role: 'admin',
            permissions: ['view_conversations', 'assign_conversations', 'manage_agents', 'view_analytics'],
            status: 'offline',
            isActive: true
        });

        console.log('\n🎉 Admin agent created successfully!');
        console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
        console.log(`📧 Email:    admin@luxfree.com`);
        console.log(`🔑 Password: admin123`);
        console.log(`👤 Name:     ${admin.firstName} ${admin.lastName}`);
        console.log(`🔐 Role:     ${admin.role}`);
        console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
        console.log('\n⚠️  IMPORTANT: Change this password after first login!');
        console.log('');

        process.exit(0);
    } catch (error) {
        console.error('❌ Error creating admin agent:', error);
        process.exit(1);
    }
}

createAdminAgent();
