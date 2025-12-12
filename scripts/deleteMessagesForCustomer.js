const mongoose = require('mongoose');
require('dotenv').config();

const Customer = require('../src/models/Customer');
const Message = require('../src/models/Message');
const Conversation = require('../src/models/Conversation');

async function deleteMessagesForCustomer(phoneNumber) {
  try {
    // Connect to MongoDB
    await mongoose.connect(process.env.MONGODB);
    console.log('✅ Connected to MongoDB');

    // Find customer by phone number (try different formats)
    let customer = await Customer.findOne({ phoneNumber });
    
    if (!customer) {
      // Try with +52 prefix
      customer = await Customer.findOne({ phoneNumber: `+52${phoneNumber}` });
    }
    
    if (!customer) {
      // Try searching for partial match
      customer = await Customer.findOne({ phoneNumber: { $regex: phoneNumber } });
    }
    
    if (!customer) {
      console.log(`❌ Customer with phone ${phoneNumber} not found`);
      
      // Show available customers
      const allCustomers = await Customer.find({}).limit(10);
      console.log('\n📋 Available customers:');
      allCustomers.forEach(c => {
        console.log(`   - ${c.phoneNumber} (${c.firstName || 'Unknown'})`);
      });
      
      process.exit(1);
    }

    console.log(`📱 Found customer: ${customer.firstName || 'Unknown'} (${customer.phoneNumber})`);

    // Find conversation for this customer
    const conversation = await Conversation.findOne({ customerId: customer._id });
    
    if (!conversation) {
      console.log(`❌ No conversation found for customer ${phoneNumber}`);
      process.exit(1);
    }

    console.log(`💬 Found conversation: ${conversation._id}`);

    // Delete all messages for this conversation
    const deleteResult = await Message.deleteMany({ conversationId: conversation._id });
    
    console.log(`🗑️  Deleted ${deleteResult.deletedCount} messages`);

    // Reset conversation message count
    await Conversation.findByIdAndUpdate(conversation._id, {
      messageCount: 0,
      unreadCount: 0,
      lastMessage: null,
      lastCustomerMessage: null,
      lastAgentResponse: null
    });

    console.log(`✅ Conversation reset successfully`);
    console.log(`\n📊 Summary:`);
    console.log(`   - Customer: ${customer.phoneNumber}`);
    console.log(`   - Messages deleted: ${deleteResult.deletedCount}`);
    console.log(`   - Conversation ID: ${conversation._id}`);

  } catch (error) {
    console.error('❌ Error:', error);
  } finally {
    await mongoose.connection.close();
    console.log('\n🔌 Database connection closed');
  }
}

// Get phone number from command line argument
const phoneNumber = process.argv[2];

if (!phoneNumber) {
  console.log('❌ Usage: node scripts/deleteMessagesForCustomer.js <phone_number>');
  console.log('Example: node scripts/deleteMessagesForCustomer.js 529991992696');
  process.exit(1);
}

deleteMessagesForCustomer(phoneNumber);
