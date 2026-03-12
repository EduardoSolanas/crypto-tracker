#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';

const rootDir = process.cwd();
const dryRun = process.argv.includes('--dry-run');

const packageJsonPath = path.join(rootDir, 'package.json');
const packageLockPath = path.join(rootDir, 'package-lock.json');
const appJsonPath = path.join(rootDir, 'app.json');
const androidGradlePath = path.join(rootDir, 'android', 'app', 'build.gradle');

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

function writeJson(filePath, data) {
  fs.writeFileSync(filePath, `${JSON.stringify(data, null, 2)}\n`, 'utf8');
}

function bumpPatch(version) {
  const [major, minor, patchWithRest] = version.split('.');
  const patch = (patchWithRest || '0').split('-')[0];
  const nextPatch = Number.parseInt(patch, 10) + 1;
  if (Number.isNaN(nextPatch)) {
    throw new Error(`Unsupported version format: ${version}`);
  }
  return `${major}.${minor}.${nextPatch}`;
}

function updateGradleContent(content, versionName, nextVersionCode) {
  let next = content;

  if (!/versionName\s+"[^"]+"/.test(next)) {
    throw new Error('Could not find versionName in android/app/build.gradle');
  }
  next = next.replace(/versionName\s+"[^"]+"/, `versionName "${versionName}"`);

  if (!/versionCode\s+\d+/.test(next)) {
    throw new Error('Could not find versionCode in android/app/build.gradle');
  }
  next = next.replace(/versionCode\s+\d+/, `versionCode ${nextVersionCode}`);

  return next;
}

const pkg = readJson(packageJsonPath);
const currentVersion = pkg.version;
const nextVersion = bumpPatch(currentVersion);

const lock = readJson(packageLockPath);
const app = readJson(appJsonPath);
const gradle = fs.readFileSync(androidGradlePath, 'utf8');

const versionCodeMatch = gradle.match(/versionCode\s+(\d+)/);
if (!versionCodeMatch) {
  throw new Error('Could not parse current versionCode from android/app/build.gradle');
}
const currentVersionCode = Number.parseInt(versionCodeMatch[1], 10);
const nextVersionCode = currentVersionCode + 1;

pkg.version = nextVersion;
lock.version = nextVersion;
if (lock.packages && lock.packages['']) {
  lock.packages[''].version = nextVersion;
}

if (!app.expo) {
  throw new Error('app.json missing expo object');
}
app.expo.version = nextVersion;

const nextGradle = updateGradleContent(gradle, nextVersion, nextVersionCode);

if (!dryRun) {
  writeJson(packageJsonPath, pkg);
  writeJson(packageLockPath, lock);
  writeJson(appJsonPath, app);
  fs.writeFileSync(androidGradlePath, nextGradle, 'utf8');
}

process.stdout.write(
  JSON.stringify(
    {
      dryRun,
      currentVersion,
      nextVersion,
      currentVersionCode,
      nextVersionCode,
    },
    null,
    2,
  ),
);
process.stdout.write('\n');

