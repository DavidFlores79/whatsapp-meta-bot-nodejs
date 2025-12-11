const mongoose = require('mongoose');
require('dotenv').config();

const Agent = require('./src/models/Agent');
const Conversation = require('./src/models/Conversation');
const Customer = require('./src/models/Customer');

async function testAssignment() {
  try {
    await mongoose.connect(process.env.MONGODB);
    console.log('Connected to MongoDB\n');

    const agent = await Agent.findOne({ email: 'admin@example.com' });
    console.log('Agent:', agent.firstName, agent.lastName);
    console.log('Agent ID:', agent._id.toString(), '\n');

    const conversation = await Conversation.findOne({ status: 'open', assignedAgent: null })
      .populate('customerId', 'firstName phoneNumber');

    if (!conversation) {
      console.log('No open conversations found to assign');
      await mongoose.connection.close();
      return;
    }

    console.log('Assigning conversation:', conversation._id);
    console.log('Customer:', conversation.customerId?.firstName || conversation.customerId?.phoneNumber, '\n');

    conversation.assignedAgent = agent._id;
    conversation.assignedAt = new Date();
    conversation.status = 'assigned';
    conversation.isAIEnabled = false;
    await conversation.save();

    agent.statistics.activeAssignments += 1;
    await agent.save();

    console.log('✅ Conversation assigned successfully!\n');

    // Simulate API fetch
    const assignedConvs = await Conversation.find({
      assignedAgent: agent._id,
      status: { $in: ['assigned', 'waiting'] }
    })
      .populate('customerId', 'firstName phoneNumber')
      .populate('assignedAgent', 'firstName lastName email _id');

    console.log(`API would return ${assignedConvs.length} conversation(s):\n`);

    assignedConvs.forEach(conv => {
      const mappedConv = {
        _id: conv._id,
        customerId: conv.customerId,
        assignedAgent: conv.assignedAgent,
        isAIEnabled: conv.isAIEnabled,
        status: conv.status
      };

      console.log('Conversation:', mappedConv._id.toString());
      console.log('  Customer:', mappedConv.customerId?.firstName || mappedConv.customerId?.phoneNumber);
      console.log('  assignedAgent:', mappedConv.assignedAgent ? {
        _id: mappedConv.assignedAgent._id.toString(),
        firstName: mappedConv.assignedAgent.firstName,
        lastName: mappedConv.assignedAgent.lastName,
        email: mappedConv.assignedAgent.email
      } : null);
      console.log('  isAIEnabled:', mappedConv.isAIEnabled);
      console.log('  status:', mappedConv.status, '\n');
    });

    await mongoose.connection.close();
  } catch (error) {
    console.error('Error:', error.message);
    console.error(error.stack);
    process.exit(1);
  }
}

testAssignment();
