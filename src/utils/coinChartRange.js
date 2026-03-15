export const COIN_CHART_RANGES = ['1H', '1D', '1W', '1M', '1Y', 'ALL'];

export const RANGE_CONFIGS = {
    '1H': { timeframe: 'minute', limit: 12, aggregate: 5 },   // 12 pts (5 min)
    '1D': { timeframe: 'hour',   limit: 24, aggregate: 1 },   // 24 pts (1 hour)
    '1W': { timeframe: 'hour',   limit: 42, aggregate: 4 },   // 42 pts (4 hr)
    '1M': { timeframe: 'day',    limit: 30, aggregate: 1 },   // 30 pts (1 day)
    '1Y': { timeframe: 'day',    limit: 122, aggregate: 3 },  // 122 pts (3 days)
    'ALL': { timeframe: 'day',   limit: 100, aggregate: 7 },  // Base config (100 pts)
};

export function getCoinChartFetchParams(range, options = {}) {
    if (range === 'ALL') {
        const { earliestTxMs, nowMs = Date.now() } = options;
        if (earliestTxMs && earliestTxMs > 0 && earliestTxMs < nowMs) {
            const daysSinceFirstTx = Math.max(30, Math.ceil((nowMs - earliestTxMs) / 86400000));
            // dynamic agg to target ~100 points
            const targetPoints = 100;
            const aggregate = Math.max(1, Math.ceil(daysSinceFirstTx / targetPoints));
            const limit = Math.min(2000, Math.ceil(daysSinceFirstTx / aggregate));
            return { timeframe: 'day', limit, aggregate };
        }
    }

    return RANGE_CONFIGS[range] || RANGE_CONFIGS['1D'];
}
