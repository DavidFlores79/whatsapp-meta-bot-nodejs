/**
 * Test script for agent notification language detection
 * Run with: node test-agent-notification.js
 */

const { getAgentLanguage, getAssignmentTemplateName } = require('./src/services/agentNotificationService');

console.log('=== Testing Agent Notification Language Detection ===\n');

// Test cases
const testCases = [
    {
        name: 'Agent with English preference',
        agent: { email: 'test@example.com', languages: ['en'] },
        expectedLang: 'en_US',
        expectedTemplate: 'agent_assignment_notification_en'
    },
    {
        name: 'Agent with Spanish preference',
        agent: { email: 'test@example.com', languages: ['es'] },
        expectedLang: 'es_MX',
        expectedTemplate: 'agent_assignment_notification_es'
    },
    {
        name: 'Agent with multiple languages (English first)',
        agent: { email: 'test@example.com', languages: ['en', 'es'] },
        expectedLang: 'en_US',
        expectedTemplate: 'agent_assignment_notification_en'
    },
    {
        name: 'Agent with multiple languages (Spanish first)',
        agent: { email: 'test@example.com', languages: ['es', 'en'] },
        expectedLang: 'es_MX',
        expectedTemplate: 'agent_assignment_notification_es'
    },
    {
        name: 'Agent with no language configured',
        agent: { email: 'test@example.com', languages: [] },
        expectedLang: 'es_MX',
        expectedTemplate: 'agent_assignment_notification_es'
    },
    {
        name: 'Agent with undefined languages',
        agent: { email: 'test@example.com' },
        expectedLang: 'es_MX',
        expectedTemplate: 'agent_assignment_notification_es'
    },
    {
        name: 'Agent with unknown language (fallback)',
        agent: { email: 'test@example.com', languages: ['fr'] },
        expectedLang: 'es_MX',
        expectedTemplate: 'agent_assignment_notification_es'
    }
];

let passed = 0;
let failed = 0;

testCases.forEach((test, index) => {
    console.log(`Test ${index + 1}: ${test.name}`);

    const language = getAgentLanguage(test.agent);
    const template = getAssignmentTemplateName(language);

    const langMatch = language === test.expectedLang;
    const templateMatch = template === test.expectedTemplate;

    if (langMatch && templateMatch) {
        console.log(`  ✅ PASSED`);
        console.log(`     Language: ${language}`);
        console.log(`     Template: ${template}`);
        passed++;
    } else {
        console.log(`  ❌ FAILED`);
        console.log(`     Expected Language: ${test.expectedLang}, Got: ${language}`);
        console.log(`     Expected Template: ${test.expectedTemplate}, Got: ${template}`);
        failed++;
    }
    console.log('');
});

console.log('=== Test Summary ===');
console.log(`Total: ${testCases.length}`);
console.log(`Passed: ${passed}`);
console.log(`Failed: ${failed}`);
console.log('');

if (failed === 0) {
    console.log('✅ All tests passed!');
    process.exit(0);
} else {
    console.log('❌ Some tests failed!');
    process.exit(1);
}
