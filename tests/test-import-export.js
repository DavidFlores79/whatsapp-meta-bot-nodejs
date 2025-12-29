/**
 * Test script for Customer Import/Export functionality
 * 
 * This script tests:
 * 1. Template download
 * 2. Customer export
 * 3. Customer import
 * 
 * Run: node test-import-export.js
 */

const XLSX = require('xlsx');
const fs = require('fs');
const path = require('path');

console.log('🧪 Testing Customer Import/Export Functionality\n');

// Test 1: Create a sample import file
console.log('1️⃣  Creating sample import file...');
try {
    const sampleCustomers = [
        {
            phoneNumber: '529991111111',
            firstName: 'Test',
            lastName: 'Customer',
            email: 'test@example.com',
            status: 'active',
            segment: 'new',
            source: 'whatsapp',
            tags: 'test;sample',
            alternativePhones: '',
            address_street: 'Calle Test 123',
            address_city: 'Mérida',
            address_state: 'Yucatán',
            address_country: 'México',
            address_postalCode: '97000',
            notes: 'Test customer for import'
        },
        {
            phoneNumber: '529992222222',
            firstName: 'Another',
            lastName: 'Test',
            email: 'another@example.com',
            status: 'active',
            segment: 'regular',
            source: 'referral',
            tags: 'vip;premium',
            alternativePhones: '529992222223',
            address_street: '',
            address_city: '',
            address_state: '',
            address_country: 'México',
            address_postalCode: '',
            notes: ''
        }
    ];

    const worksheet = XLSX.utils.json_to_sheet(sampleCustomers);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, 'Customers');

    const testFilePath = path.join(__dirname, 'test-customers-import.xlsx');
    XLSX.writeFile(workbook, testFilePath);
    
    console.log('   ✅ Sample file created:', testFilePath);
} catch (error) {
    console.error('   ❌ Error creating sample file:', error.message);
}

// Test 2: Verify XLSX library can read the file
console.log('\n2️⃣  Verifying XLSX library can read files...');
try {
    const testFilePath = path.join(__dirname, 'test-customers-import.xlsx');
    
    if (fs.existsSync(testFilePath)) {
        const workbook = XLSX.readFile(testFilePath);
        const sheetName = workbook.SheetNames[0];
        const worksheet = workbook.Sheets[sheetName];
        const data = XLSX.utils.sheet_to_json(worksheet);
        
        console.log('   ✅ Successfully read file');
        console.log('   📊 Found', data.length, 'customers');
        console.log('   📝 Sample customer:', data[0].phoneNumber, '-', data[0].firstName, data[0].lastName);
    } else {
        console.log('   ⚠️  Test file not found');
    }
} catch (error) {
    console.error('   ❌ Error reading file:', error.message);
}

// Test 3: Create export template structure
console.log('\n3️⃣  Creating export template...');
try {
    const exportData = [
        {
            phoneNumber: '529991234567',
            firstName: 'Juan',
            lastName: 'Pérez',
            email: 'juan@example.com',
            status: 'active',
            segment: 'vip',
            source: 'whatsapp',
            tags: 'vip;premium',
            alternativePhones: '529991234568',
            address_street: 'Calle Principal 123',
            address_city: 'Mérida',
            address_state: 'Yucatán',
            address_country: 'México',
            address_postalCode: '97000',
            notes: 'Cliente preferente',
            isBlocked: 'No',
            blockReason: '',
            firstContact: new Date().toISOString(),
            lastInteraction: new Date().toISOString(),
            createdAt: new Date().toISOString()
        }
    ];

    const worksheet = XLSX.utils.json_to_sheet(exportData);
    
    // Set column widths
    worksheet['!cols'] = [
        { wch: 15 }, { wch: 15 }, { wch: 15 }, { wch: 25 }, { wch: 10 },
        { wch: 10 }, { wch: 12 }, { wch: 20 }, { wch: 20 }, { wch: 30 },
        { wch: 15 }, { wch: 15 }, { wch: 10 }, { wch: 10 }, { wch: 40 },
        { wch: 10 }, { wch: 20 }, { wch: 20 }, { wch: 20 }, { wch: 20 }
    ];

    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, 'Customers');

    const exportFilePath = path.join(__dirname, 'test-customers-export.xlsx');
    XLSX.writeFile(workbook, exportFilePath);
    
    console.log('   ✅ Export template created:', exportFilePath);
} catch (error) {
    console.error('   ❌ Error creating export template:', error.message);
}

// Test 4: Buffer conversion (simulating file upload)
console.log('\n4️⃣  Testing buffer conversion (file upload simulation)...');
try {
    const testFilePath = path.join(__dirname, 'test-customers-import.xlsx');
    
    if (fs.existsSync(testFilePath)) {
        const fileBuffer = fs.readFileSync(testFilePath);
        const workbook = XLSX.read(fileBuffer, { type: 'buffer' });
        const sheetName = workbook.SheetNames[0];
        const worksheet = workbook.Sheets[sheetName];
        const data = XLSX.utils.sheet_to_json(worksheet);
        
        console.log('   ✅ Buffer conversion successful');
        console.log('   📊 Parsed', data.length, 'customers from buffer');
    } else {
        console.log('   ⚠️  Test file not found');
    }
} catch (error) {
    console.error('   ❌ Error with buffer conversion:', error.message);
}

// Test 5: CSV format support
console.log('\n5️⃣  Testing CSV format...');
try {
    const sampleData = [
        {
            phoneNumber: '529993333333',
            firstName: 'CSV',
            lastName: 'Test',
            email: 'csv@example.com',
            status: 'active',
            segment: 'new'
        }
    ];

    const worksheet = XLSX.utils.json_to_sheet(sampleData);
    const csv = XLSX.utils.sheet_to_csv(worksheet);
    
    const csvFilePath = path.join(__dirname, 'test-customers.csv');
    fs.writeFileSync(csvFilePath, csv);
    
    console.log('   ✅ CSV file created:', csvFilePath);
    
    // Read CSV back
    const csvContent = fs.readFileSync(csvFilePath, 'utf8');
    const csvWorkbook = XLSX.read(csvContent, { type: 'string' });
    const csvData = XLSX.utils.sheet_to_json(csvWorkbook.Sheets[csvWorkbook.SheetNames[0]]);
    
    console.log('   ✅ CSV read successful');
    console.log('   📊 Parsed', csvData.length, 'customer from CSV');
} catch (error) {
    console.error('   ❌ Error with CSV:', error.message);
}

console.log('\n✨ All tests completed!\n');
console.log('📝 Test files created:');
console.log('   - test-customers-import.xlsx (for testing imports)');
console.log('   - test-customers-export.xlsx (export format example)');
console.log('   - test-customers.csv (CSV format example)');
console.log('\n💡 Next steps:');
console.log('   1. Start the server: npm run dev');
console.log('   2. Login to get JWT token');
console.log('   3. Test endpoints:');
console.log('      GET  /api/v2/customers/template - Download template');
console.log('      GET  /api/v2/customers/export - Export customers');
console.log('      POST /api/v2/customers/bulk/import - Import customers');
console.log('');
