const mongoose = require('mongoose');
const Ticket = require('./src/models/Ticket');

const ticketId = process.argv[2] || 'LUX-2025-000003';

mongoose.connect(process.env.MONGODB || 'mongodb://localhost:27017/whatsapp-bot')
  .then(async () => {
    console.log(`Looking for ticket: ${ticketId}`);

    const ticket = await Ticket.findOne({ ticketId });

    if (!ticket) {
      console.log('Ticket not found');
      process.exit(1);
    }

    console.log(`Found ticket: ${ticket.ticketId}`);
    console.log(`Current attachments: ${ticket.attachments?.length || 0}`);

    if (ticket.attachments && ticket.attachments.length > 0) {
      console.log('\nAttachments to clear:');
      ticket.attachments.forEach((att, idx) => {
        console.log(`  ${idx + 1}. ${att.type}: ${att.filename || 'Untitled'}`);
      });

      // Clear attachments
      ticket.attachments = [];
      await ticket.save();

      console.log(`\n✅ Cleared all attachments from ticket ${ticketId}`);
    } else {
      console.log('No attachments to clear');
    }

    process.exit(0);
  })
  .catch(err => {
    console.error('Error:', err);
    process.exit(1);
  });
