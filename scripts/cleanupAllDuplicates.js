/**
 * Script to clean up duplicate messages from database
 * Run with: node scripts/cleanupAllDuplicates.js
 * 
 * Options:
 *   --dry-run     Preview what would be deleted without actually deleting
 *   --customer    Only clean messages for a specific customer phone
 *   --clear-all   Clear ALL messages for a conversation (use with --customer)
 */

require('dotenv').config();
const mongoose = require('mongoose');
const Message = require('../src/models/Message');
const Conversation = require('../src/models/Conversation');

const args = process.argv.slice(2);
const isDryRun = args.includes('--dry-run');
const clearAll = args.includes('--clear-all');
const customerIndex = args.indexOf('--customer');
const customerPhone = customerIndex !== -1 ? args[customerIndex + 1] : null;

async function cleanupDuplicates() {
  try {
    await mongoose.connect(process.env.MONGODB);
    console.log('Connected to MongoDB\n');

    if (isDryRun) {
      console.log('🔍 DRY RUN MODE - No changes will be made\n');
    }

    // If clearing all messages for a specific customer
    if (clearAll && customerPhone) {
      console.log(`🗑️  Clearing ALL messages for customer: ${customerPhone}`);
      
      const conv = await Conversation.findOne({}).populate('customerId');
      // Find conversation by phone
      const conversations = await Conversation.find({})
        .populate('customerId');
      
      const targetConv = conversations.find(c => 
        c.customerId?.phoneNumber === customerPhone || 
        c.customerId?.phoneNumber?.includes(customerPhone)
      );

      if (!targetConv) {
        console.log(`❌ No conversation found for phone: ${customerPhone}`);
        process.exit(1);
      }

      console.log(`   Found conversation: ${targetConv._id}`);
      const messageCount = await Message.countDocuments({ conversationId: targetConv._id });
      console.log(`   Messages to delete: ${messageCount}`);

      if (!isDryRun) {
        await Message.deleteMany({ conversationId: targetConv._id });
        await Conversation.findByIdAndUpdate(targetConv._id, { 
          messageCount: 0, 
          unreadCount: 0,
          lastMessage: null 
        });
        console.log(`✅ Deleted ${messageCount} messages`);
      }
      
      process.exit(0);
    }

    // Find all duplicate messages by whatsappMessageId
    console.log('🔍 Finding duplicate messages by WhatsApp Message ID...\n');
    
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
          contents: { $push: '$content' },
          timestamps: { $push: '$timestamp' }
        }
      },
      {
        $match: {
          count: { $gt: 1 }
        }
      },
      {
        $sort: { count: -1 }
      }
    ]);

    console.log(`Found ${duplicates.length} duplicate message groups\n`);

    let totalToDelete = 0;
    let totalDeleted = 0;

    for (const dup of duplicates) {
      const count = dup.count;
      const toDeleteCount = count - 1; // Keep one, delete rest
      totalToDelete += toDeleteCount;

      console.log(`📋 WhatsApp ID: ${dup._id.substring(0, 50)}...`);
      console.log(`   Content: "${dup.contents[0]?.substring(0, 50)}..."`);
      console.log(`   Duplicates: ${count} (will delete ${toDeleteCount})`);

      if (!isDryRun) {
        // Sort by timestamp, keep the oldest one
        const idsWithTimestamps = dup.ids.map((id, index) => ({
          id,
          timestamp: dup.timestamps[index]
        }));
        idsWithTimestamps.sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp));
        
        // Delete all except the first (oldest)
        const toDelete = idsWithTimestamps.slice(1).map(item => item.id);
        const result = await Message.deleteMany({ _id: { $in: toDelete } });
        totalDeleted += result.deletedCount;
        console.log(`   ✅ Deleted ${result.deletedCount} duplicates`);
      }
      console.log('');
    }

    // Also find messages with same content + timestamp (exact duplicates without whatsappMessageId)
    console.log('\n🔍 Finding exact duplicate messages (same content + timestamp)...\n');

    const exactDupes = await Message.aggregate([
      {
        $group: {
          _id: {
            conversationId: '$conversationId',
            content: '$content',
            timestamp: '$timestamp',
            sender: '$sender'
          },
          count: { $sum: 1 },
          ids: { $push: '$_id' }
        }
      },
      {
        $match: {
          count: { $gt: 1 }
        }
      },
      {
        $sort: { count: -1 }
      }
    ]);

    console.log(`Found ${exactDupes.length} exact duplicate groups\n`);

    for (const dup of exactDupes) {
      const count = dup.count;
      const toDeleteCount = count - 1;
      totalToDelete += toDeleteCount;

      console.log(`📋 Content: "${dup._id.content?.substring(0, 50)}..."`);
      console.log(`   Sender: ${dup._id.sender}, Time: ${dup._id.timestamp}`);
      console.log(`   Duplicates: ${count} (will delete ${toDeleteCount})`);

      if (!isDryRun) {
        // Keep the first one, delete the rest
        const toDelete = dup.ids.slice(1);
        const result = await Message.deleteMany({ _id: { $in: toDelete } });
        totalDeleted += result.deletedCount;
        console.log(`   ✅ Deleted ${result.deletedCount} duplicates`);
      }
      console.log('');
    }

    // Recalculate message counts for all conversations
    if (!isDryRun && totalDeleted > 0) {
      console.log('\n🔄 Recalculating conversation message counts...\n');
      
      const conversations = await Conversation.find({});
      for (const conv of conversations) {
        const actualCount = await Message.countDocuments({ conversationId: conv._id });
        if (conv.messageCount !== actualCount) {
          await Conversation.findByIdAndUpdate(conv._id, { messageCount: actualCount });
          console.log(`   Updated ${conv._id}: ${conv.messageCount} → ${actualCount}`);
        }
      }
    }

    console.log('\n========================================');
    if (isDryRun) {
      console.log(`📊 DRY RUN SUMMARY: Would delete ${totalToDelete} duplicate messages`);
      console.log('\nRun without --dry-run to actually delete duplicates');
    } else {
      console.log(`✅ CLEANUP COMPLETE: Deleted ${totalDeleted} duplicate messages`);
    }
    console.log('========================================\n');

    process.exit(0);
  } catch (error) {
    console.error('Error:', error);
    process.exit(1);
  }
}

cleanupDuplicates();
