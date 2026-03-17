#!/usr/bin/env node
/**
 * Build a release APK and install it on the connected ADB device/emulator.
 * Usage:  node scripts/build-android.mjs [--device <serial>]
 */
import { execSync, spawnSync } from 'child_process';
import { readdirSync, statSync } from 'fs';
import { join } from 'path';
import { fileURLToPath } from 'url';
import path from 'path';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const ANDROID_DIR = join(ROOT, 'android');
const APK_OUT = join(ANDROID_DIR, 'app', 'build', 'outputs', 'apk', 'release');

// Parse --device flag
const deviceIdx = process.argv.indexOf('--device');
const device = deviceIdx !== -1 ? process.argv[deviceIdx + 1] : null;
const adbTarget = device ? ['-s', device] : [];

function run(cmd, opts = {}) {
  console.log(`\n▶ ${cmd}`);
  execSync(cmd, { stdio: 'inherit', ...opts });
}

function adb(...args) {
  const result = spawnSync('adb', [...adbTarget, ...args], { stdio: 'inherit' });
  if (result.status !== 0) process.exit(result.status ?? 1);
}

// ── 1. Build ────────────────────────────────────────────────────────────────
const gradle = process.platform === 'win32' ? 'gradlew.bat' : './gradlew';
run(`${gradle} assembleRelease --no-daemon`, {
  cwd: ANDROID_DIR,
  env: { ...process.env, NODE_ENV: 'production' },
});

// ── 2. Find the newest APK ───────────────────────────────────────────────────
const apks = readdirSync(APK_OUT)
  .filter((f) => f.endsWith('.apk'))
  .map((f) => ({ f, mtime: statSync(join(APK_OUT, f)).mtimeMs }))
  .sort((a, b) => b.mtime - a.mtime);

if (!apks.length) {
  console.error('❌  No APK found in', APK_OUT);
  process.exit(1);
}

const apkPath = join(APK_OUT, apks[0].f);
console.log(`\n✅  APK: ${apkPath}`);

// ── 3. Install ───────────────────────────────────────────────────────────────
console.log('\n📲  Installing…');
adb('install', '-r', apkPath);

// ── 4. Launch ────────────────────────────────────────────────────────────────
console.log('\n🚀  Launching app…');
adb(
  'shell',
  'am',
  'start',
  '-n',
  'com.belcebuu.CryptoPortfolio/.MainActivity',
);

console.log('\n✅  Done!');

