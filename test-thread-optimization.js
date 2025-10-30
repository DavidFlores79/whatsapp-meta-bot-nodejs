#!/usr/bin/env node

/**
 * Test script for OpenAI thread optimization
 * Usage: node test-thread-optimization.js
 */

const openaiService = require('../src/services/openaiService');
const mongoose = require('mongoose');
require('dotenv').config();

async function testThreadOptimization() {
  try {
    console.log('🧪 Testing OpenAI Thread Optimization...\n');

    // Connect to database
    if (!mongoose.connection.readyState) {
      await mongoose.connect(process.env.MONGODB);
      console.log('✅ Connected to MongoDB\n');
    }

    const testUserId = '1234567890';
    console.log(`Testing with user ID: ${testUserId}\n`);

    // Test 1: Send multiple messages to trigger cleanup
    console.log('📝 Test 1: Sending 12 messages to trigger automatic cleanup...');
    for (let i = 1; i <= 12; i++) {
      console.log(`Sending message ${i}/12...`);
      const response = await openaiService.getAIResponse(
        `Test message ${i}: This is a test message to fill up the thread.`,
        testUserId
      );
      console.log(`Response ${i}: ${response.substring(0, 50)}...`);
      
      // Small delay to avoid rate limits
      await new Promise(resolve => setTimeout(resolve, 1000));
    }

    console.log('\n✅ Test 1 completed\n');

    // Test 2: Check thread stats
    console.log('📊 Test 2: Checking thread statistics...');
    const stats = await openaiService.getActiveUsersCount();
    console.log('Active users:', stats);

    // Test 3: Manual cleanup
    console.log('\n🧹 Test 3: Testing manual cleanup...');
    const cleanupResult = await openaiService.cleanupUserThread(testUserId);
    console.log('Manual cleanup result:', cleanupResult);

    // Test 4: Send more messages after cleanup
    console.log('\n📝 Test 4: Sending 3 more messages after cleanup...');
    for (let i = 1; i <= 3; i++) {
      const response = await openaiService.getAIResponse(
        `Post-cleanup message ${i}: Testing conversation continuity.`,
        testUserId
      );
      console.log(`Post-cleanup response ${i}: ${response.substring(0, 50)}...`);
      await new Promise(resolve => setTimeout(resolve, 1000));
    }

    console.log('\n✅ All tests completed successfully!');
    
    // Cleanup test data
    console.log('\n🧹 Cleaning up test data...');
    await openaiService.clearUserContext(testUserId);
    console.log('✅ Test data cleaned up');

  } catch (error) {
    console.error('❌ Test failed:', error);
  } finally {
    if (mongoose.connection.readyState) {
      await mongoose.connection.close();
      console.log('📴 Disconnected from MongoDB');
    }
    process.exit(0);
  }
}

// Run the test
if (require.main === module) {
  testThreadOptimization();
}

module.exports = testThreadOptimization;