require('dotenv').config();
const mongoose = require('mongoose');
const Message = require('../src/models/Message');
const Conversation = require('../src/models/Conversation');

async function cleanupDuplicates() {
  try {
    await mongoose.connect(process.env.MONGODB);
    console.log('Connected to MongoDB');

    // Find duplicate messages by whatsappMessageId
    const duplicates = await Message.aggregate([
      {
        $match: {
          whatsappMessageId: { $exists: true, $ne: null }
        }
      },
      {
        $group: {
          _id: '$whatsappMessageId',
          count: { $sum: 1 },
          ids: { $push: '$_id' },
          timestamps: { $push: '$timestamp' }
        }
      },
      {
        $match: {
          count: { $gt: 1 }
        }
      }
    ]);

    console.log(`\nFound ${duplicates.length} duplicate message groups`);
    
    let totalDeleted = 0;

    for (const dup of duplicates) {
      // Sort by timestamp to keep the oldest one (first received)
      const idsWithTimestamps = dup.ids.map((id, index) => ({
        id,
        timestamp: dup.timestamps[index]
      }));
      
      idsWithTimestamps.sort((a, b) => a.timestamp - b.timestamp);
      
      // Keep the first one, delete the rest
      const toDelete = idsWithTimestamps.slice(1).map(item => item.id);
      
      if (toDelete.length > 0) {
        const result = await Message.deleteMany({ _id: { $in: toDelete } });
        totalDeleted += result.deletedCount;
        console.log(`  Deleted ${result.deletedCount} duplicates for whatsappMessageId: ${dup._id}`);
      }
    }

    console.log(`\n✅ Total duplicates removed: ${totalDeleted}`);

    // Recalculate message counts for all conversations
    console.log('\nRecalculating conversation message counts...');
    const conversations = await Conversation.find({});
    
    for (const conv of conversations) {
      const actualCount = await Message.countDocuments({ conversationId: conv._id });
      if (conv.messageCount !== actualCount) {
        await Conversation.findByIdAndUpdate(conv._id, { messageCount: actualCount });
        console.log(`  Updated conversation ${conv._id}: ${conv.messageCount} → ${actualCount}`);
      }
    }

    console.log('\n✅ Cleanup complete!');
    process.exit(0);
  } catch (error) {
    console.error('Error:', error);
    process.exit(1);
  }
}

cleanupDuplicates();
