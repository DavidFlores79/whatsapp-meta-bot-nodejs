/**
 * Test to reproduce the actual bug scenario
 * Simulates what happens when agent phone is in wrong format
 */

const { buildTemplateJSON } = require('./src/shared/whatsappModels');
const { formatNumber } = require('./src/shared/processMessage');

console.log('=== REPRODUCING THE ACTUAL BUG ===\n');

// SCENARIO 1: Agent phone stored as 12 digits (CORRECT)
console.log('SCENARIO 1: Agent phone stored correctly (12 digits)');
const agentPhone12 = '529991234567';  // Already formatted
const customerPhone13 = '5219997654321';  // Customer phone (13 digits from webhook)

console.log(`Agent phone (DB): ${agentPhone12}`);
console.log(`Customer phone: ${customerPhone13}`);

const agentPhoneAfterFormat = formatNumber(agentPhone12);
console.log(`Agent phone after formatNumber(): ${agentPhoneAfterFormat}`);
console.log(`Result: ${agentPhoneAfterFormat === agentPhone12 ? '✅ UNCHANGED (correct)' : '❌ CHANGED'}`);

const templateData1 = buildTemplateJSON(
    agentPhoneAfterFormat,
    'agent_assignment_notification_es',
    [
        { type: 'text', text: 'John Doe' },
        { type: 'text', text: customerPhone13 },
        { type: 'text', text: 'Media' }
    ],
    'es_MX'
);

const parsed1 = JSON.parse(templateData1);
console.log(`\nWhatsApp API "to" field: ${parsed1.to}`);
console.log(`Expected: ${agentPhone12}`);
console.log(`Result: ${parsed1.to === agentPhone12 ? '✅ CORRECT - Sends to AGENT' : '❌ WRONG'}\n`);

console.log('='.repeat(60) + '\n');

// SCENARIO 2: Agent phone stored as 13 digits (THE BUG)
console.log('SCENARIO 2: Agent phone stored incorrectly (13 digits)');
const agentPhone13 = '5219991234567';  // NOT formatted (13 digits)

console.log(`Agent phone (DB): ${agentPhone13}`);
console.log(`Customer phone: ${customerPhone13}`);

const agentPhoneAfterFormat2 = formatNumber(agentPhone13);
console.log(`Agent phone after formatNumber(): ${agentPhoneAfterFormat2}`);
console.log(`Result: ${agentPhoneAfterFormat2 !== agentPhone13 ? '✅ FORMATTED to 12 digits' : '❌ UNCHANGED'}`);

const templateData2 = buildTemplateJSON(
    agentPhoneAfterFormat2,
    'agent_assignment_notification_es',
    [
        { type: 'text', text: 'John Doe' },
        { type: 'text', text: customerPhone13 },
        { type: 'text', text: 'Media' }
    ],
    'es_MX'
);

const parsed2 = JSON.parse(templateData2);
console.log(`\nWhatsApp API "to" field: ${parsed2.to}`);
console.log(`Expected: 529991234567 (agent)`);
console.log(`Result: ${parsed2.to === '529991234567' ? '✅ CORRECT - Sends to AGENT' : '❌ WRONG'}\n`);

console.log('='.repeat(60) + '\n');

// SCENARIO 3: THE REAL BUG - Parameters in wrong order?
console.log('SCENARIO 3: Checking if parameters could be swapped');
console.log('What if buildTemplateJSON is called with wrong parameter order?');
console.log('');

// Simulate wrong call (swapping agent and customer phones)
const templateDataWrong = buildTemplateJSON(
    customerPhone13,  // ❌ WRONG - Customer phone as recipient!
    'agent_assignment_notification_es',
    [
        { type: 'text', text: 'John Doe' },
        { type: 'text', text: agentPhone12 },  // Agent phone in parameters
        { type: 'text', text: 'Media' }
    ],
    'es_MX'
);

const parsedWrong = JSON.parse(templateDataWrong);
console.log(`WhatsApp API "to" field: ${parsedWrong.to}`);
console.log(`This would send to: ${parsedWrong.to === customerPhone13 ? 'CUSTOMER ❌' : 'Agent'}`);
console.log('');

console.log('='.repeat(60));
console.log('\n🔍 CONCLUSION:');
console.log('If the notification was sent to the customer, one of these happened:');
console.log('1. buildTemplateJSON was called with customer phone as first parameter');
console.log('2. agent.phoneNumber in DB contains customer phone number by mistake');
console.log('3. conversation.customerId is not properly populated/wrong customer');
