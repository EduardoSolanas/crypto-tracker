const isDev = typeof __DEV__ !== 'undefined' ? __DEV__ : globalThis.__DEV__;

function tag(level, ...args) {
    if (!isDev && level === 'log') return;
    // eslint-disable-next-line no-console
    console[level](...args);
}

export const logger = {
    log:   (...args) => tag('log',   ...args),
    warn:  (...args) => tag('warn',  ...args),
    error: (...args) => tag('error', ...args),
};
