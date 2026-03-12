/**
 * CSV Import Debug Helper
 * 
 * Usage:
 * 1. Place your CSV file in the project root as "test.csv"
 * 2. Run: node test-csv-import.js
 * 3. This will show you exactly what the parser sees
 */

const fs = require('fs');

// Read your CSV file
const csvPath = process.argv[2] || './test.csv';

if (!fs.existsSync(csvPath)) {
    console.error('❌ CSV file not found:', csvPath);
    console.log('\nUsage: node test-csv-import.js <path-to-csv-file>');
    console.log('Example: node test-csv-import.js ./my-transactions.csv');
    process.exit(1);
}

const csvText = fs.readFileSync(csvPath, 'utf-8');

console.log('📄 CSV File Analysis\n');
console.log('=' .repeat(60));

// Show first 5 lines
const lines = csvText.split('\n');
console.log('\n📋 First 5 lines of your CSV:');
console.log('-'.repeat(60));
lines.slice(0, 5).forEach((line, i) => {
    console.log(`Line ${i + 1}: ${line}`);
});

// Analyze headers
console.log('\n🔍 Looking for header row...');
const headerIndex = lines.findIndex((line) => {
    const lower = line.toLowerCase();
    return lower.includes('base amount') || 
           lower.includes('amount') && lower.includes('date') ||
           lower.includes('way') && lower.includes('currency');
});

if (headerIndex === -1) {
    console.log('❌ Could not find header row automatically');
    console.log('\n💡 Your CSV should have headers like:');
    console.log('   - "Date", "Way", "Base amount", "Base currency (name)", etc.');
    console.log('\n📝 Detected columns in first row:');
    const parseCSVLine = (text) => {
        const result = [];
        let cell = '';
        let inQuotes = false;
        for (let i = 0; i < text.length; i++) {
            const char = text[i];
            if (char === '"') inQuotes = !inQuotes;
            else if (char === ',' && !inQuotes) {
                result.push(cell);
                cell = '';
            } else {
                cell += char;
            }
        }
        result.push(cell);
        return result;
    };
    const cols = parseCSVLine(lines[0]);
    cols.forEach((col, i) => {
        console.log(`   Column ${i + 1}: "${col}"`);
    });
} else {
    console.log(`✅ Found header at line ${headerIndex + 1}`);
    
    const parseCSVLine = (text) => {
        const result = [];
        let cell = '';
        let inQuotes = false;
        for (let i = 0; i < text.length; i++) {
            const char = text[i];
            if (char === '"') inQuotes = !inQuotes;
            else if (char === ',' && !inQuotes) {
                result.push(cell);
                cell = '';
            } else {
                cell += char;
            }
        }
        result.push(cell);
        return result;
    };
    
    const headers = parseCSVLine(lines[headerIndex]);
    console.log('\n📊 Detected columns:');
    headers.forEach((h, i) => {
        console.log(`   Column ${i + 1}: "${h}"`);
    });
    
    // Try to import
    console.log('\n🔄 Attempting to parse with app logic...');
    try {
        const { parseDeltaCsvToTxns } = require('./src/csv.js');
        const txns = parseDeltaCsvToTxns(csvText);
        console.log(`✅ Successfully parsed ${txns.length} transactions!`);
        
        if (txns.length > 0) {
            console.log('\n📋 First transaction:');
            console.log(JSON.stringify(txns[0], null, 2));
        }
        
        if (txns.length > 1) {
            console.log('\n📋 Last transaction:');
            console.log(JSON.stringify(txns[txns.length - 1], null, 2));
        }
    } catch (e) {
        console.log('❌ Parse error:', e.message);
    }
}

console.log('\n' + '='.repeat(60));
