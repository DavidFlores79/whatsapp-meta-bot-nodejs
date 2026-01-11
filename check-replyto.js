require('dotenv').config();
const mongoose = require('mongoose');

async function checkReplyTo() {
  try {
    await mongoose.connect(process.env.MONGODB);
    console.log('Connected to MongoDB');
    
    const Message = require('./src/models/Message');
    
    // Check recent inbound messages
    console.log('\n=== Recent INBOUND Messages ===');
    const inbound = await Message.find({ 
      direction: 'inbound'
    }).sort({ timestamp: -1 }).limit(10).lean();
    
    console.log('Count:', inbound.length);
    inbound.forEach(m => {
      console.log('  ID:', m._id);
      console.log('  whatsappMessageId:', m.whatsappMessageId || 'NOT SET');
      console.log('  replyTo:', m.replyTo || 'NULL');
      console.log('  Content:', m.content?.substring(0, 40));
      console.log('  timestamp:', m.timestamp);
      console.log('---');
    });
    
    // Check if any messages have replyTo
    const messagesWithReply = await Message.find({ 
      replyTo: { $exists: true, $ne: null } 
    }).limit(5).lean();
    
    console.log('\n=== Messages with replyTo populated ===');
    console.log('Count:', messagesWithReply.length);
    if (messagesWithReply.length > 0) {
      messagesWithReply.forEach(m => {
        console.log('  ID:', m._id);
        console.log('  Content:', m.content?.substring(0, 40));
        console.log('  replyTo:', m.replyTo);
      });
    }
    
    await mongoose.disconnect();
    console.log('\nDone');
    process.exit(0);
  } catch (err) {
    console.error('Error:', err);
    process.exit(1);
  }
}

checkReplyTo();
