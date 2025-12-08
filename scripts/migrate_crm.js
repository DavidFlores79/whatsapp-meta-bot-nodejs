require('dotenv').config({ path: '../.env' });
const mongoose = require('mongoose');
const UserThread = require('../src/models/UserThread');
const Customer = require('../src/models/Customer');
const Conversation = require('../src/models/Conversation');
const Message = require('../src/models/Message');

const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/whatsapp_bot';

async function migrate() {
    try {
        await mongoose.connect(MONGODB_URI);
        console.log('Connected to MongoDB');

        const threads = await UserThread.find({});
        console.log(`Found ${threads.length} threads to migrate`);

        for (const thread of threads) {
            console.log(`Migrating user ${thread.userId}...`);

            // 1. Create or Update Customer
            let customer = await Customer.findOne({ phoneNumber: thread.userId });
            if (!customer) {
                customer = await Customer.create({
                    phoneNumber: thread.userId,
                    firstContact: thread.createdAt,
                    lastInteraction: thread.lastInteraction,
                    statistics: {
                        totalConversations: 1,
                        totalMessages: thread.messageCount
                    }
                });
                console.log(`  Created customer ${customer._id}`);
            }

            // 2. Create Conversation
            // Check if open conversation exists
            let conversation = await Conversation.findOne({
                customerId: customer._id,
                status: { $in: ['open', 'assigned', 'waiting'] }
            });

            if (!conversation) {
                conversation = await Conversation.create({
                    customerId: customer._id,
                    status: 'open',
                    channel: 'whatsapp',
                    source: 'migration',
                    createdAt: thread.createdAt,
                    updatedAt: thread.updatedAt,
                    messageCount: thread.messageCount
                });
                console.log(`  Created conversation ${conversation._id}`);
            }

            // 3. Migrate History to Messages
            if (thread.history && thread.history.length > 0) {
                console.log(`  Migrating ${thread.history.length} messages...`);
                for (const hist of thread.history) {
                    await Message.create({
                        conversationId: conversation._id,
                        customerId: customer._id,
                        content: hist.content,
                        type: 'text',
                        direction: hist.role === 'user' ? 'inbound' : 'outbound',
                        sender: hist.role === 'user' ? 'customer' : 'ai',
                        status: 'read', // Assume read for old messages
                        timestamp: hist.timestamp,
                        aiProcessed: hist.role === 'assistant'
                    });
                }
            }
        }

        console.log('Migration completed successfully');
        process.exit(0);
    } catch (error) {
        console.error('Migration failed:', error);
        process.exit(1);
    }
}

migrate();
