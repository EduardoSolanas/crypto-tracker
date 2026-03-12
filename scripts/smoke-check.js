#!/usr/bin/env node

/**
 * Release Smoke Check Script
 * Verifies critical stability settings before Android build
 */

const fs = require('fs');
const path = require('path');

const root = process.cwd();
let exitCode = 0;

function check(name, condition, message) {
    if (condition) {
        console.log(`✅ ${name}`);
        return true;
    } else {
        console.log(`❌ ${name}: ${message}`);
        exitCode = 1;
        return false;
    }
}

console.log('🔍 Running release smoke checks...\n');

// Check 1: No worklets in package.json
const packageJson = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));
check(
    'package.json - no worklets dependency',
    !packageJson.dependencies['react-native-worklets'],
    'react-native-worklets found in dependencies - remove it'
);

// Check 2: No reanimated in package.json  
check(
    'package.json - no reanimated dependency',
    !packageJson.dependencies['react-native-reanimated'],
    'react-native-reanimated found in dependencies - remove it'
);

// Check 3: No wagmi-charts in package.json
check(
    'package.json - no wagmi-charts dependency',
    !packageJson.dependencies['react-native-wagmi-charts'],
    'react-native-wagmi-charts found in dependencies - remove it'
);

// Check 4: newArchEnabled=false in app.json
const appJson = JSON.parse(fs.readFileSync(path.join(root, 'app.json'), 'utf8'));
check(
    'app.json - newArchEnabled is false',
    appJson.expo?.newArchEnabled === false,
    `newArchEnabled is ${appJson.expo?.newArchEnabled} - must be false`
);

// Check 5: Verify CryptoGraph.js has no reanimated imports
const cryptoGraphPath = path.join(root, 'src/components/CryptoGraph.js');
if (fs.existsSync(cryptoGraphPath)) {
    const cryptoGraphContent = fs.readFileSync(cryptoGraphPath, 'utf8');
    check(
        'CryptoGraph.js - no reanimated imports',
        !cryptoGraphContent.includes('react-native-reanimated') && 
        !cryptoGraphContent.includes('react-native-wagmi-charts'),
        'Found prohibited imports in CryptoGraph.js'
    );
} else {
    check('CryptoGraph.js exists', false, 'File not found');
}

// Check 6: babel.config.js has no reanimated plugin
const babelConfigPath = path.join(root, 'babel.config.js');
const babelConfigContent = fs.readFileSync(babelConfigPath, 'utf8');
check(
    'babel.config.js - no reanimated plugin',
    !babelConfigContent.includes('react-native-reanimated/plugin'),
    'reanimated plugin found in babel config'
);

console.log('\n' + (exitCode === 0 ? '✅ All checks passed!' : '❌ Some checks failed'));
process.exit(exitCode);
