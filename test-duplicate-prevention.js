/**
 * Test Script: Duplicate Message Prevention
 * 
 * This script simulates WhatsApp webhook behavior to test
 * the duplicate message prevention system.
 * 
 * Usage: node test-duplicate-prevention.js
 */

const axios = require('axios');

const SERVER_URL = 'http://localhost:5000/api/v2';
const TEST_PHONE = '5219991234567';

// Simulated WhatsApp webhook payload
function createWebhookPayload(messageId, text) {
  return {
    object: 'whatsapp_business_account',
    entry: [
      {
        id: 'test-entry-id',
        changes: [
          {
            value: {
              messaging_product: 'whatsapp',
              metadata: {
                display_phone_number: '1234567890',
                phone_number_id: 'test-phone-id'
              },
              messages: [
                {
                  from: TEST_PHONE,
                  id: messageId,
                  timestamp: Date.now().toString(),
                  text: {
                    body: text
                  },
                  type: 'text'
                }
              ]
            },
            field: 'messages'
          }
        ]
      }
    ]
  };
}

async function sendWebhook(messageId, text, label) {
  try {
    const payload = createWebhookPayload(messageId, text);
    console.log(`\n📤 ${label}`);
    console.log(`   Message ID: ${messageId}`);
    console.log(`   Text: "${text}"`);
    
    const startTime = Date.now();
    const response = await axios.post(SERVER_URL, payload, {
      headers: { 'Content-Type': 'application/json' }
    });
    const duration = Date.now() - startTime;
    
    console.log(`   ✅ Response: ${response.data}`);
    console.log(`   ⏱️  Response time: ${duration}ms`);
    
    return { success: true, duration };
  } catch (error) {
    console.log(`   ❌ Error: ${error.message}`);
    return { success: false, error: error.message };
  }
}

async function runTests() {
  console.log('='.repeat(60));
  console.log('🧪 DUPLICATE MESSAGE PREVENTION TESTS');
  console.log('='.repeat(60));
  
  console.log('\n📋 Test Suite Overview:');
  console.log('1. Normal message processing');
  console.log('2. Duplicate message detection (same ID)');
  console.log('3. Rapid duplicate messages (different IDs)');
  console.log('4. Webhook response time check');
  
  // Test 1: Normal message
  console.log('\n' + '─'.repeat(60));
  console.log('TEST 1: Normal Message Processing');
  console.log('─'.repeat(60));
  await sendWebhook('msg-001', 'Hola', 'Sending first message');
  await new Promise(resolve => setTimeout(resolve, 2000));
  
  // Test 2: Exact duplicate (same message ID)
  console.log('\n' + '─'.repeat(60));
  console.log('TEST 2: Duplicate Message Detection');
  console.log('Expected: Should skip processing (duplicate detected)');
  console.log('─'.repeat(60));
  await sendWebhook('msg-001', 'Hola', 'Sending duplicate (same ID)');
  await new Promise(resolve => setTimeout(resolve, 2000));
  
  // Test 3: Rapid messages (different IDs - both should process)
  console.log('\n' + '─'.repeat(60));
  console.log('TEST 3: Rapid Messages (Different IDs)');
  console.log('Expected: Both should process (different message IDs)');
  console.log('─'.repeat(60));
  await sendWebhook('msg-002', 'Hola', 'Sending message 2');
  await new Promise(resolve => setTimeout(resolve, 100)); // Very short delay
  await sendWebhook('msg-003', 'Hola', 'Sending message 3 (rapid)');
  await new Promise(resolve => setTimeout(resolve, 2000));
  
  // Test 4: Response time verification
  console.log('\n' + '─'.repeat(60));
  console.log('TEST 4: Webhook Response Time');
  console.log('Expected: < 1000ms (immediate response)');
  console.log('─'.repeat(60));
  const result = await sendWebhook('msg-004', 'Test response time', 'Timing test');
  
  if (result.success && result.duration < 1000) {
    console.log('   ✅ PASS: Response time is acceptable');
  } else if (result.success) {
    console.log('   ⚠️  WARNING: Response time is slow but working');
  }
  
  // Summary
  console.log('\n' + '='.repeat(60));
  console.log('📊 TEST SUMMARY');
  console.log('='.repeat(60));
  console.log('✅ All tests completed!');
  console.log('\n📝 Expected Behavior:');
  console.log('   • Test 1: Normal processing, AI response sent');
  console.log('   • Test 2: Duplicate detected, processing skipped');
  console.log('   • Test 3: Both processed (different IDs)');
  console.log('   • Test 4: Fast webhook response (< 1s)');
  console.log('\n🔍 Check server logs for:');
  console.log('   • "⚠️ Duplicate message detected" for Test 2');
  console.log('   • "✅ Processing new message" for Tests 1, 3, 4');
  console.log('   • Response times < 100ms');
  console.log('='.repeat(60));
}

// Check if server is running
async function checkServer() {
  try {
    console.log('🔍 Checking if server is running...');
    await axios.get(SERVER_URL.replace('/api/v2', '/health'));
    console.log('✅ Server is running!\n');
    return true;
  } catch (error) {
    console.log('❌ Server is not running!');
    console.log('   Please start the server first: npm run dev');
    return false;
  }
}

// Run tests
(async () => {
  const serverRunning = await checkServer();
  if (serverRunning) {
    await runTests();
  }
})();
