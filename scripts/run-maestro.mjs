import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';

const isWin = process.platform === 'win32';

function run(cmd, args) {
    return spawnSync(cmd, args, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
}

function resolveMaestroCommand() {
    const checker = isWin ? 'where' : 'which';
    const inPath = run(checker, ['maestro']);
    if (inPath.status === 0) {
        return { cmd: 'maestro', argsPrefix: [] };
    }

    if (isWin) {
        const localBat = join(process.env.USERPROFILE || '', '.maestro', 'maestro', 'bin', 'maestro.bat');
        if (existsSync(localBat)) {
            return { cmd: 'cmd', argsPrefix: ['/c', localBat] };
        }
    }

    return null;
}

const resolved = resolveMaestroCommand();
if (!resolved) {
    console.error('[E2E] Maestro CLI not found. Install it or add it to PATH.');
    process.exit(1);
}

const args = process.argv.slice(2);
const env = {
    ...process.env,
    MAESTRO_CLI_ANALYSIS_NOTIFICATION_DISABLED:
        process.env.MAESTRO_CLI_ANALYSIS_NOTIFICATION_DISABLED || 'true',
};

const result = spawnSync(resolved.cmd, [...resolved.argsPrefix, ...args], {
    stdio: 'inherit',
    env,
    shell: false,
});

if (result.error) {
    console.error(`[E2E] Failed to execute Maestro: ${result.error.message}`);
    process.exit(1);
}

process.exit(result.status ?? 1);


