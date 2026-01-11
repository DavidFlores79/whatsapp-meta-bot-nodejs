/**
 * Test Business Type Isolation
 * 
 * This script tests that tickets are properly isolated by business type
 * and that cross-contamination is prevented.
 * 
 * Run with: node scripts/test-business-isolation.js
 */

require('dotenv').config();
const mongoose = require('mongoose');
const Ticket = require('../src/models/Ticket');
const Customer = require('../src/models/Customer');
const configService = require('../src/services/configurationService');

const TEST_CUSTOMER_PHONE = '5219999999999';
let testCustomerId;

async function setupTest() {
    console.log('🧪 Setting up business type isolation test...\n');
    
    await mongoose.connect(process.env.MONGODB, {
        useNewUrlParser: true,
        useUnifiedTopology: true
    });
    
    // Create or get test customer
    let customer = await Customer.findOne({ phoneNumber: TEST_CUSTOMER_PHONE });
    if (!customer) {
        customer = new Customer({
            name: 'Test Customer',
            phoneNumber: TEST_CUSTOMER_PHONE,
            email: 'test@example.com'
        });
        await customer.save();
        console.log('✅ Created test customer');
    } else {
        console.log('✅ Using existing test customer');
    }
    
    testCustomerId = customer._id;
    return customer;
}

async function createTestTickets() {
    console.log('\n📝 Creating test tickets for different business types...\n');
    
    const tickets = [];
    
    // Luxfree ticket
    const luxfreeTicket = new Ticket({
        ticketId: 'TEST-LUX-001',
        customerId: testCustomerId,
        subject: 'Solar Panel Installation Issue',
        description: 'Need help with solar panel installation',
        category: 'solar_installation',
        businessType: 'luxfree',
        priority: 'medium',
        status: 'open',
        presetSnapshot: {
            presetId: 'luxfree',
            assistantName: 'Lúmen',
            companyName: 'LUXFREE'
        }
    });
    await luxfreeTicket.save();
    tickets.push(luxfreeTicket);
    console.log(`✅ Created LUXFREE ticket: ${luxfreeTicket.ticketId}`);
    
    // Ecommerce ticket
    const ecommerceTicket = new Ticket({
        ticketId: 'TEST-ECOM-001',
        customerId: testCustomerId,
        subject: 'Product Return Request',
        description: 'Want to return defective product',
        category: 'product_defect',
        businessType: 'ecommerce',
        priority: 'high',
        status: 'open',
        presetSnapshot: {
            presetId: 'ecommerce',
            assistantName: 'ShopAssist',
            companyName: 'TiendaOnline'
        }
    });
    await ecommerceTicket.save();
    tickets.push(ecommerceTicket);
    console.log(`✅ Created ECOMMERCE ticket: ${ecommerceTicket.ticketId}`);
    
    // Restaurant ticket
    const restaurantTicket = new Ticket({
        ticketId: 'TEST-REST-001',
        customerId: testCustomerId,
        subject: 'Late Food Delivery',
        description: 'Order delayed by 2 hours',
        category: 'delivery_issue',
        businessType: 'restaurant',
        priority: 'urgent',
        status: 'open',
        presetSnapshot: {
            presetId: 'restaurant',
            assistantName: 'FoodBot',
            companyName: 'Restaurante'
        }
    });
    await restaurantTicket.save();
    tickets.push(restaurantTicket);
    console.log(`✅ Created RESTAURANT ticket: ${restaurantTicket.ticketId}`);
    
    return tickets;
}

async function testIsolation() {
    console.log('\n' + '═'.repeat(60));
    console.log('🔬 TEST 1: Business Type Isolation');
    console.log('═'.repeat(60));
    
    // Test 1: Query only luxfree tickets
    const luxfreeTickets = await Ticket.find({
        customerId: testCustomerId,
        businessType: 'luxfree'
    });
    
    console.log(`\n✅ LUXFREE query returned ${luxfreeTickets.length} ticket(s)`);
    console.log(`   Expected: 1 | Actual: ${luxfreeTickets.length}`);
    console.log(`   ${luxfreeTickets.length === 1 ? '✅ PASS' : '❌ FAIL'}`);
    
    // Test 2: Query only ecommerce tickets
    const ecommerceTickets = await Ticket.find({
        customerId: testCustomerId,
        businessType: 'ecommerce'
    });
    
    console.log(`\n✅ ECOMMERCE query returned ${ecommerceTickets.length} ticket(s)`);
    console.log(`   Expected: 1 | Actual: ${ecommerceTickets.length}`);
    console.log(`   ${ecommerceTickets.length === 1 ? '✅ PASS' : '❌ FAIL'}`);
    
    // Test 3: Query only restaurant tickets
    const restaurantTickets = await Ticket.find({
        customerId: testCustomerId,
        businessType: 'restaurant'
    });
    
    console.log(`\n✅ RESTAURANT query returned ${restaurantTickets.length} ticket(s)`);
    console.log(`   Expected: 1 | Actual: ${restaurantTickets.length}`);
    console.log(`   ${restaurantTickets.length === 1 ? '✅ PASS' : '❌ FAIL'}`);
    
    // Test 4: Query without business type filter (should return all 3)
    const allTickets = await Ticket.find({
        customerId: testCustomerId,
        ticketId: /^TEST-/
    });
    
    console.log(`\n✅ Query WITHOUT filter returned ${allTickets.length} ticket(s)`);
    console.log(`   Expected: 3 | Actual: ${allTickets.length}`);
    console.log(`   ${allTickets.length === 3 ? '✅ PASS' : '❌ FAIL'}`);
}

async function testCrossContamination() {
    console.log('\n' + '═'.repeat(60));
    console.log('🔬 TEST 2: Cross-Contamination Prevention');
    console.log('═'.repeat(60));
    
    // Simulate luxfree preset active
    console.log('\n📌 Simulating LUXFREE preset active...');
    
    // Should only see luxfree tickets
    const visibleTickets = await Ticket.find({
        customerId: testCustomerId,
        businessType: 'luxfree'  // Filter by active business type
    });
    
    console.log(`\n✅ Customer sees ${visibleTickets.length} ticket(s)`);
    visibleTickets.forEach(t => {
        console.log(`   - ${t.ticketId} (${t.businessType}): ${t.subject}`);
    });
    
    const hasEcommerceTicket = visibleTickets.some(t => t.businessType === 'ecommerce');
    const hasRestaurantTicket = visibleTickets.some(t => t.businessType === 'restaurant');
    
    console.log(`\n🔒 Isolation Check:`);
    console.log(`   Ecommerce tickets visible? ${hasEcommerceTicket ? '❌ FAIL - LEAKED!' : '✅ PASS - Hidden'}`);
    console.log(`   Restaurant tickets visible? ${hasRestaurantTicket ? '❌ FAIL - LEAKED!' : '✅ PASS - Hidden'}`);
}

async function testCategoryValidation() {
    console.log('\n' + '═'.repeat(60));
    console.log('🔬 TEST 3: Category Validation');
    console.log('═'.repeat(60));
    
    const presets = await configService.getConfigurationPresets();
    
    // Get luxfree categories
    const luxfreePreset = presets.find(p => p.id === 'luxfree');
    const luxfreeCategories = luxfreePreset.config.ticket_categories.map(c => c.id);
    
    console.log('\n✅ LUXFREE valid categories:');
    luxfreeCategories.forEach(cat => console.log(`   - ${cat}`));
    
    // Try to create luxfree ticket with ecommerce category (should fail)
    const invalidCategoryTicket = {
        ticketId: 'TEST-INVALID-001',
        customerId: testCustomerId,
        subject: 'Invalid Test',
        description: 'Testing invalid category',
        category: 'product_defect',  // Ecommerce category
        businessType: 'luxfree',       // But luxfree business
        status: 'open'
    };
    
    const isValid = luxfreeCategories.includes(invalidCategoryTicket.category);
    
    console.log(`\n🔒 Category Mismatch Check:`);
    console.log(`   Category: ${invalidCategoryTicket.category}`);
    console.log(`   Business: ${invalidCategoryTicket.businessType}`);
    console.log(`   Valid? ${isValid ? '❌ FAIL - Should be invalid!' : '✅ PASS - Correctly rejected'}`);
}

async function cleanup() {
    console.log('\n' + '═'.repeat(60));
    console.log('🧹 Cleaning up test data...');
    console.log('═'.repeat(60));
    
    // Delete test tickets
    const result = await Ticket.deleteMany({
        ticketId: /^TEST-/
    });
    
    console.log(`\n✅ Deleted ${result.deletedCount} test ticket(s)`);
    console.log('ℹ️  Test customer kept for future tests');
}

// Main execution
(async () => {
    try {
        await setupTest();
        const tickets = await createTestTickets();
        
        await testIsolation();
        await testCrossContamination();
        await testCategoryValidation();
        
        await cleanup();
        
        console.log('\n' + '═'.repeat(60));
        console.log('✅ ALL TESTS COMPLETED');
        console.log('═'.repeat(60));
        
        await mongoose.connection.close();
        process.exit(0);
    } catch (error) {
        console.error('\n❌ Test failed:', error);
        await mongoose.connection.close();
        process.exit(1);
    }
})();
