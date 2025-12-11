require('dotenv').config();
const mongoose = require('mongoose');
const Message = require('../src/models/Message');

async function checkLocationDuplicates() {
  try {
    await mongoose.connect(process.env.MONGODB);
    console.log('Connected to MongoDB\n');

    // Get the most recent 10 location messages
    const locationMessages = await Message.find({ 
      type: 'location'
    })
    .sort({ timestamp: -1 })
    .limit(10)
    .select('_id whatsappMessageId content timestamp');
    
    console.log(`Last ${locationMessages.length} location messages:`);
    locationMessages.forEach((msg, i) => {
      console.log(`${i+1}. ${msg.content}`);
      console.log(`   DB ID: ${msg._id}`);
      console.log(`   WhatsApp ID: ${msg.whatsappMessageId || 'MISSING!'}`);
      console.log(`   Time: ${msg.timestamp}\n`);
    });
    
    // Group by whatsappMessageId to find duplicates
    const grouped = {};
    locationMessages.forEach(msg => {
      const key = msg.whatsappMessageId || 'NO_ID';
      if (!grouped[key]) grouped[key] = [];
      grouped[key].push(msg);
    });
    
    console.log('\n=== Duplicate Analysis ===');
    let foundDuplicates = false;
    Object.entries(grouped).forEach(([key, msgs]) => {
      if (msgs.length > 1) {
        foundDuplicates = true;
        console.log(`\n❌ DUPLICATE: WhatsApp ID ${key}`);
        console.log(`   Found ${msgs.length} copies in database:`);
        msgs.forEach(m => {
          console.log(`   - DB ID: ${m._id}, Content: ${m.content.substring(0, 50)}, Time: ${m.timestamp}`);
        });
      }
    });
    
    if (!foundDuplicates) {
      console.log('✅ No duplicates found in last 10 location messages');
    }
    
    process.exit(0);
  } catch (error) {
    console.error('Error:', error);
    process.exit(1);
  }
}

checkLocationDuplicates();
