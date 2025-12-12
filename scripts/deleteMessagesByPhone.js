const mongoose = require('mongoose');
require('dotenv').config();

async function deleteMessages(phoneNumber) {
  try {
    await mongoose.connect(process.env.MONGODB);
    console.log('✅ Connected to MongoDB');

    const db = mongoose.connection.db;
    
    // Find customer
    const customer = await db.collection('customers').findOne({ phoneNumber: phoneNumber });
    
    if (!customer) {
      console.log(`❌ Customer ${phoneNumber} not found`);
      
      // Show all customers
      const customers = await db.collection('customers').find({}).toArray();
      console.log(`\n📋 Found ${customers.length} customers in database:`);
      customers.forEach(c => {
        console.log(`   - ${c.phoneNumber} (ID: ${c._id})`);
      });
      process.exit(1);
    }

    console.log(`✅ Found customer: ${customer.phoneNumber} (ID: ${customer._id})`);

    // Find conversation
    const conversation = await db.collection('conversations').findOne({ 
      customerId: customer._id 
    });

    if (!conversation) {
      console.log(`❌ No conversation found for customer`);
      process.exit(1);
    }

    console.log(`✅ Found conversation: ${conversation._id}`);

    // Delete all messages
    const result = await db.collection('messages').deleteMany({ 
      conversationId: conversation._id 
    });

    console.log(`🗑️  Deleted ${result.deletedCount} messages`);

    // Reset conversation
    await db.collection('conversations').updateOne(
      { _id: conversation._id },
      { 
        $set: { 
          messageCount: 0,
          unreadCount: 0,
          lastMessage: null
        } 
      }
    );

    console.log('✅ Done!');

  } catch (error) {
    console.error('❌ Error:', error);
  } finally {
    await mongoose.connection.close();
  }
}

const phone = process.argv[2] || '529991992696';
deleteMessages(phone);
