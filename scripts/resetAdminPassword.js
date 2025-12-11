require('dotenv').config();
const mongoose = require('mongoose');
const Agent = require('../src/models/Agent');
const authService = require('../src/services/authService');

async function resetAdminPassword() {
    try {
        // Connect to MongoDB
        await mongoose.connect(process.env.MONGODB, {
            useNewUrlParser: true,
            useUnifiedTopology: true
        });

        console.log('✅ Connected to MongoDB\n');

        // Find the admin agent
        const admin = await Agent.findOne({ email: 'admin@example.com' });

        if (!admin) {
            console.log('❌ Admin agent not found');
            console.log('   Run: npm run create-admin');
            process.exit(1);
        }

        console.log('🔧 Resetting admin password...\n');

        // Hash new password
        const newPassword = 'admin123';
        const hashedPassword = await authService.hashPassword(newPassword);

        // Update password
        admin.password = hashedPassword;
        admin.refreshTokens = []; // Clear all refresh tokens
        await admin.save();

        console.log('🎉 Admin password reset successfully!');
        console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
        console.log(`📧 Email:    admin@example.com`);
        console.log(`🔑 Password: admin123`);
        console.log(`👤 Name:     ${admin.firstName} ${admin.lastName}`);
        console.log(`🔐 Role:     ${admin.role}`);
        console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

        // Test the password
        const isValid = await authService.comparePassword(newPassword, hashedPassword);
        console.log(`✅ Password verification test: ${isValid ? 'PASSED' : 'FAILED'}`);
        console.log('');

        process.exit(0);
    } catch (error) {
        console.error('❌ Error:', error);
        process.exit(1);
    }
}

resetAdminPassword();
