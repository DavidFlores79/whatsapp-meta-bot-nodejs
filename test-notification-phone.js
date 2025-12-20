/**
 * Test script to verify correct phone number usage in agent notifications
 * Run with: node test-notification-phone.js
 */

const { buildTemplateJSON } = require('./src/shared/whatsappModels');
const { formatNumber } = require('./src/shared/processMessage');

console.log('=== Testing Agent Notification Phone Number Usage ===\n');

// Simulate the notification scenario
const agentPhoneRaw = '5219991234567'; // Agent's phone (13 digits)
const customerPhoneRaw = '5219997654321'; // Customer's phone (13 digits)

console.log('📱 Input Phone Numbers:');
console.log(`   Agent (raw):    ${agentPhoneRaw}`);
console.log(`   Customer (raw): ${customerPhoneRaw}`);
console.log('');

// Format agent phone (as done in agentNotificationService.js line 54)
const agentPhone = formatNumber(agentPhoneRaw);
console.log('🔧 After formatNumber():');
console.log(`   Agent (formatted):    ${agentPhone}`);
console.log(`   Expected:             529991234567 (12 digits)`);
console.log('');

// Template parameters (as built in agentNotificationService.js lines 61-74)
const customerName = 'John Doe';
const customerPhone = customerPhoneRaw; // ⚠️ This is NOT formatted!
const priorityText = 'Media';

const parameters = [
    { type: 'text', text: customerName },
    { type: 'text', text: customerPhone },  // Customer phone in template body
    { type: 'text', text: priorityText }
];

console.log('📝 Template Parameters:');
console.log(`   1. Customer Name: ${customerName}`);
console.log(`   2. Customer Phone: ${customerPhone} ⚠️ (NOT formatted, still 13 digits)`);
console.log(`   3. Priority: ${priorityText}`);
console.log('');

// Build template (as done in agentNotificationService.js lines 82-87)
const templateData = buildTemplateJSON(
    agentPhone,                              // "to" field - should be agent
    'agent_assignment_notification_es',      // template name
    parameters,                              // includes customer phone as parameter
    'es_MX'                                 // language
);

console.log('📤 Generated WhatsApp API Payload:');
const parsedData = JSON.parse(templateData);
console.log(JSON.stringify(parsedData, null, 2));
console.log('');

console.log('✅ VERIFICATION:');
console.log(`   "to" field: ${parsedData.to}`);
console.log(`   Expected:   ${agentPhone} (agent's phone)`);
console.log(`   Match: ${parsedData.to === agentPhone ? '✅ CORRECT' : '❌ WRONG'}`);
console.log('');

console.log('📋 Template Body Parameters:');
parsedData.template.components[0].parameters.forEach((param, index) => {
    console.log(`   Parameter ${index + 1}: ${param.text}`);
});
console.log('');

// Check if there's any mix-up
if (parsedData.to === agentPhone) {
    console.log('✅ RESULT: Message will be sent to the AGENT (correct)');
} else if (parsedData.to === customerPhone || parsedData.to === formatNumber(customerPhone)) {
    console.log('❌ RESULT: Message will be sent to the CUSTOMER (wrong!)');
} else {
    console.log('⚠️ RESULT: Message will be sent to unknown number');
}
