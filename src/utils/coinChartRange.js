export const COIN_CHART_RANGES = ['1H', '1D', '1W', '1M', '1Y', 'ALL'];

const RANGE_CONFIGS = {
    '1H': { timeframe: 'minute', limit: 60, aggregate: 1 },
    '1D': { timeframe: 'minute', limit: 120, aggregate: 12 },
    '1W': { timeframe: 'hour', limit: 84, aggregate: 2 },
    '1M': { timeframe: 'hour', limit: 120, aggregate: 6 },
    '1Y': { timeframe: 'day', limit: 365, aggregate: 1 },
    'ALL': { timeframe: 'day', limit: 200, aggregate: 5 },
};

export function getCoinChartFetchParams(range, options = {}) {
    if (range === 'ALL') {
        const { earliestTxMs, nowMs = Date.now() } = options;
        if (earliestTxMs && earliestTxMs > 0 && earliestTxMs < nowMs) {
            const daysSinceFirstTx = Math.max(30, Math.ceil((nowMs - earliestTxMs) / 86400000));
            const aggregate = Math.max(1, Math.ceil(daysSinceFirstTx / 200));
            const limit = Math.min(2000, Math.ceil(daysSinceFirstTx / aggregate));
            return { timeframe: 'day', limit, aggregate };
        }
    }

    return RANGE_CONFIGS[range] || RANGE_CONFIGS['1D'];
}
