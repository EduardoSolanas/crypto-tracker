import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';

const isWin = process.platform === 'win32';

function run(cmd, args, opts = {}) {
    return spawnSync(cmd, args, {
        encoding: 'utf8',
        stdio: ['ignore', 'pipe', 'pipe'],
        ...opts,
    });
}

function fail(message, details = '') {
    console.error(`\n[E2E preflight] ${message}`);
    if (details) console.error(details.trimEnd());
    process.exit(1);
}

function ensureCommandAvailable(command) {
    const checker = isWin ? 'where' : 'which';
    const result = run(checker, [command]);
    if (result.status !== 0) {
        fail(
            `Required command not found: ${command}`,
            isWin
                ? 'Install or add it to PATH. Example: C:\\Users\\<you>\\.maestro\\maestro\\bin\\maestro.bat'
                : `Install or add '${command}' to PATH.`
        );
    }
}

function ensureMaestroAvailable() {
    const checker = isWin ? 'where' : 'which';
    const inPath = run(checker, ['maestro']);
    if (inPath.status === 0) return;

    if (isWin) {
        const localBat = join(process.env.USERPROFILE || '', '.maestro', 'maestro', 'bin', 'maestro.bat');
        if (existsSync(localBat)) return;
    }

    fail(
        'Required command not found: maestro',
        isWin
            ? 'Install or add it to PATH. Example: C:\\Users\\<you>\\.maestro\\maestro\\bin\\maestro.bat'
            : "Install or add 'maestro' to PATH."
    );
}

function parseAdbDevices(raw) {
    const lines = raw
        .split(/\r?\n/)
        .map((l) => l.trim())
        .filter(Boolean)
        .filter((l) => !l.startsWith('List of devices attached'));

    return lines.map((line) => {
        const [id, state = ''] = line.split(/\s+/);
        return { id, state };
    });
}

function getAppId() {
    try {
        const appJsonPath = join(process.cwd(), 'app.json');
        const parsed = JSON.parse(readFileSync(appJsonPath, 'utf8'));
        return parsed?.expo?.android?.package || 'com.belcebuu.CryptoPortfolio';
    } catch (_e) {
        return 'com.belcebuu.CryptoPortfolio';
    }
}

ensureMaestroAvailable();
ensureCommandAvailable('adb');

const devicesResult = run('adb', ['devices']);
if (devicesResult.status !== 0) {
    fail('Unable to query Android devices with adb.', devicesResult.stderr || devicesResult.stdout);
}

const devices = parseAdbDevices(devicesResult.stdout || '');
const unauthorized = devices.filter((d) => d.state === 'unauthorized');
const online = devices.filter((d) => d.state === 'device');

if (unauthorized.length > 0) {
    const ids = unauthorized.map((d) => ` - ${d.id}`).join('\n');
    fail(
        'Unauthorized Android device(s) detected. Maestro can fail device selection in this state.',
        `Disconnect or authorize these devices first:\n${ids}\n\nThen run:\n - adb kill-server\n - adb start-server\n - adb devices`
    );
}

if (online.length === 0) {
    fail(
        'No authorized Android device/emulator found.',
        'Start an emulator, then run: adb devices'
    );
}

if (online.length > 1) {
    const ids = online.map((d) => ` - ${d.id}`).join('\n');
    fail(
        'Multiple authorized devices found. Use a single target for deterministic E2E runs.',
        `Connected devices:\n${ids}\n\nDisconnect extras (or run Maestro manually with --udid).`
    );
}

const selectedDevice = online[0].id;
const appId = getAppId();
const packageResult = run('adb', ['-s', selectedDevice, 'shell', 'pm', 'list', 'packages', appId]);

if (packageResult.status !== 0) {
    fail(
        `Unable to query installed packages on '${selectedDevice}'.`,
        packageResult.stderr || packageResult.stdout
    );
}

const installed = (packageResult.stdout || '').includes(`package:${appId}`);
if (!installed) {
    fail(
        `App is not installed on '${selectedDevice}' (${appId}).`,
        'Install latest debug build first: npm run android'
    );
}

console.log(`[E2E preflight] OK - device: ${selectedDevice}, app: ${appId}`);


