/**
 * Check which messages have whatsappMessageId saved
 */
require('dotenv').config();
const mongoose = require('mongoose');
const Message = require('./src/models/Message');

async function check() {
  await mongoose.connect(process.env.MONGODB);
  console.log('Connected to MongoDB\n');

  // Get recent outbound messages
  console.log('=== RECENT OUTBOUND (AI/Agent) MESSAGES ===');
  const outbound = await Message.find({ direction: 'outbound' })
    .sort({ createdAt: -1 })
    .limit(20)
    .select('content direction sender whatsappMessageId createdAt');

  outbound.forEach((m, i) => {
    const hasId = m.whatsappMessageId ? '✅' : '❌';
    console.log(`${i + 1}. ${hasId} [${m.sender}] ${m.content?.slice(0, 50)}...`);
    if (m.whatsappMessageId) {
      console.log(`   ID: ${m.whatsappMessageId}`);
    }
    console.log(`   Created: ${m.createdAt}`);
  });

  console.log('\n=== RECENT INBOUND (Customer) MESSAGES WITH CONTEXT ===');
  // Check inbound messages that might be replies (have replyTo)
  const inbound = await Message.find({ direction: 'inbound' })
    .sort({ createdAt: -1 })
    .limit(20)
    .select('content direction sender whatsappMessageId replyTo createdAt')
    .populate('replyTo', 'content sender');

  inbound.forEach((m, i) => {
    const hasReply = m.replyTo ? '✅ HAS REPLY TO' : '';
    console.log(`${i + 1}. ${m.content?.slice(0, 60)}... ${hasReply}`);
    if (m.replyTo) {
      console.log(`   Replied to: "${m.replyTo.content?.slice(0, 50)}..." by ${m.replyTo.sender}`);
    }
    console.log(`   WhatsApp ID: ${m.whatsappMessageId || 'N/A'}`);
    console.log(`   Created: ${m.createdAt}`);
  });

  console.log('\n=== STATISTICS ===');
  const outboundWithId = await Message.countDocuments({ 
    direction: 'outbound', 
    whatsappMessageId: { $exists: true, $ne: null } 
  });
  const outboundTotal = await Message.countDocuments({ direction: 'outbound' });
  console.log(`Outbound messages with whatsappMessageId: ${outboundWithId}/${outboundTotal}`);

  const inboundWithReply = await Message.countDocuments({ 
    direction: 'inbound', 
    replyTo: { $exists: true, $ne: null } 
  });
  const inboundTotal = await Message.countDocuments({ direction: 'inbound' });
  console.log(`Inbound messages with replyTo: ${inboundWithReply}/${inboundTotal}`);

  await mongoose.disconnect();
  console.log('\nDone!');
}

check().catch(console.error);
