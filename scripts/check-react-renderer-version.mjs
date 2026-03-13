import fs from 'node:fs';
import path from 'node:path';

function readText(filePath) {
  return fs.readFileSync(filePath, 'utf8');
}

function readJson(filePath) {
  return JSON.parse(readText(filePath));
}

function fail(message) {
  console.error(`\n[ci:guard] ${message}\n`);
  process.exit(1);
}

function extractRendererVersion(rendererFileContent) {
  const explicitMismatchMessage = rendererFileContent.match(/react-native-renderer:\s+([0-9]+\.[0-9]+\.[0-9]+)/);
  if (explicitMismatchMessage?.[1]) return explicitMismatchMessage[1];

  const reconcilerVersion = rendererFileContent.match(/reconcilerVersion:\s+"([0-9]+\.[0-9]+\.[0-9]+)"/);
  if (reconcilerVersion?.[1]) return reconcilerVersion[1];

  return null;
}

function main() {
  const root = process.cwd();
  const reactPkgPath = path.join(root, 'node_modules', 'react', 'package.json');
  const rendererPkgPath = path.join(root, 'node_modules', 'react-test-renderer', 'package.json');
  const rnRendererDevPath = path.join(
    root,
    'node_modules',
    'react-native',
    'Libraries',
    'Renderer',
    'implementations',
    'ReactNativeRenderer-dev.js'
  );

  if (!fs.existsSync(reactPkgPath) || !fs.existsSync(rendererPkgPath) || !fs.existsSync(rnRendererDevPath)) {
    fail('Missing installed dependencies for version guard. Run "npm ci" first.');
  }

  const reactVersion = readJson(reactPkgPath).version;
  const testRendererVersion = readJson(rendererPkgPath).version;
  const rnRendererVersion = extractRendererVersion(readText(rnRendererDevPath));

  if (!rnRendererVersion) {
    fail('Could not detect react-native-renderer version from ReactNativeRenderer-dev.js.');
  }

  const mismatches = [];
  if (reactVersion !== rnRendererVersion) {
    mismatches.push(`react (${reactVersion}) != react-native-renderer (${rnRendererVersion})`);
  }
  if (testRendererVersion !== rnRendererVersion) {
    mismatches.push(`react-test-renderer (${testRendererVersion}) != react-native-renderer (${rnRendererVersion})`);
  }

  if (mismatches.length > 0) {
    fail(`Version mismatch detected:\n- ${mismatches.join('\n- ')}\nPin React + react-test-renderer to ${rnRendererVersion}.`);
  }

  console.log(`[ci:guard] OK: react=${reactVersion}, react-test-renderer=${testRendererVersion}, react-native-renderer=${rnRendererVersion}`);
}

main();

