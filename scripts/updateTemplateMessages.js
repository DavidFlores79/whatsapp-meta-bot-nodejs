/**
 * Script to update existing template messages with proper display content
 * This fixes messages that were saved with "Template: name" format
 */

require('dotenv').config();
const mongoose = require('mongoose');
const Message = require('../src/models/Message');
const Template = require('../src/models/Template');

/**
 * Extract readable content from template components for display
 */
function getTemplateDisplayContent(template, parameters = []) {
  if (!template || !template.components || template.components.length === 0) {
    return `📄 Template: ${template?.name || 'Unknown'}`;
  }

  let content = [];

  template.components.forEach(component => {
    if (component.text) {
      let text = component.text;
      
      // Replace placeholders {{1}}, {{2}}, etc. with actual parameter values
      if (parameters && parameters.length > 0) {
        parameters.forEach((param, index) => {
          const placeholder = `{{${index + 1}}}`;
          text = text.replace(new RegExp(placeholder.replace(/[{}]/g, '\\$&'), 'g'), param);
        });
      }
      
      // Add component type prefix for clarity
      const prefix = component.type === 'HEADER' ? '📌 ' : 
                     component.type === 'FOOTER' ? '📎 ' : '';
      content.push(prefix + text);
    }
  });

  // If no text content found, fall back to template name
  if (content.length === 0) {
    return `📄 Template: ${template.name}`;
  }

  return content.join('\n');
}

async function updateTemplateMessages() {
  try {
    console.log('Connecting to MongoDB...');
    await mongoose.connect(process.env.MONGODB);
    console.log('Connected successfully\n');

    // Find all template messages
    const templateMessages = await Message.find({ 
      type: 'template',
      'template.name': { $exists: true }
    }).sort({ timestamp: 1 });

    console.log(`Found ${templateMessages.length} template messages to process\n`);

    let updatedCount = 0;
    let skippedCount = 0;
    let errorCount = 0;

    for (const message of templateMessages) {
      try {
        // Check if message content has placeholders like {{1}}, {{2}}
        const hasPlaceholders = /\{\{\d+\}\}/.test(message.content);
        
        if (!hasPlaceholders && !message.content.startsWith('Template:')) {
          console.log(`Skipping message ${message._id} - already has proper content without placeholders`);
          skippedCount++;
          continue;
        }

        // Find the template
        const template = await Template.findOne({ name: message.template.name });
        
        if (!template) {
          console.log(`⚠️  Template "${message.template.name}" not found for message ${message._id}`);
          errorCount++;
          continue;
        }

        // Generate new content
        const newContent = getTemplateDisplayContent(template, message.template.parameters);

        // Update message
        message.content = newContent;
        await message.save();

        console.log(`✅ Updated message ${message._id}`);
        console.log(`   Template: ${message.template.name}`);
        console.log(`   Parameters: ${JSON.stringify(message.template.parameters)}`);
        console.log(`   New content: ${newContent.substring(0, 60)}${newContent.length > 60 ? '...' : ''}`);
        console.log();

        updatedCount++;

      } catch (error) {
        console.error(`❌ Error processing message ${message._id}:`, error.message);
        errorCount++;
      }
    }

    console.log('\n=== Summary ===');
    console.log(`Total messages processed: ${templateMessages.length}`);
    console.log(`✅ Updated: ${updatedCount}`);
    console.log(`⏭️  Skipped: ${skippedCount}`);
    console.log(`❌ Errors: ${errorCount}`);

  } catch (error) {
    console.error('Fatal error:', error);
  } finally {
    await mongoose.connection.close();
    console.log('\nDatabase connection closed');
  }
}

// Run the script
updateTemplateMessages();
