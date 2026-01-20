// Named constants for magic numbers
const SIGNIFICANT_VALUE_THRESHOLD = 10;  // Minimum asset value to fetch history for
const MAX_GRAPH_POINTS = 60;  // Maximum points to render on graph
const MIN_QUANTITY = 0.00000001;  // Dust threshold for filtering tiny amounts

export const computePortfolioHistory = async ({
    allTxns,
    currentPortfolio,
    currency,
    range,
    fetchCandles
}) => {
    const startTime = Date.now();

    // Default return definition
    const emptyResult = {
        chartData: [],
        chartColor: '#94a3b8',
        delta: { val: 0, pct: 0 },
        coinDeltas: {}
    };

    if (!allTxns || !allTxns.length) {
        const now = Date.now();
        return {
            ...emptyResult,
            chartData: [{ timestamp: now - 86400000, value: 0 }, { timestamp: now, value: 0 }]
        };
    }

    // FILTER: Only fetch history for assets with value > SIGNIFICANT_VALUE_THRESHOLD
    const significantSymbols = new Set();
    if (currentPortfolio) {
        currentPortfolio.forEach(p => {
            if (p.value > SIGNIFICANT_VALUE_THRESHOLD) significantSymbols.add(p.symbol);
        });
    }

    // --- 1. PARAMS & TIME POINTS (SIMPLIFIED) ---
    // Using optimal point counts for better performance
    let rLimit = 30;
    let rTimeframe = 'day';
    switch (range) {
        case '1H':  rTimeframe = 'minute'; rLimit = 30; break;  // 2 min intervals
        case '1D':  rTimeframe = 'hour';   rLimit = 24; break;  // Hourly (MAJOR OPTIMIZATION)
        case '1W':  rTimeframe = 'hour';   rLimit = 42; break;  // 4 hour intervals
        case '1M':  rTimeframe = 'day';    rLimit = 30; break;  // Daily
        case '1Y':  rTimeframe = 'day';    rLimit = 52; break;  // Weekly
        case 'ALL': rTimeframe = 'day';    rLimit = 50; break;  // Adaptive
        default:    rTimeframe = 'day';    rLimit = 30;
    }

    let stepSeconds = 86400;
    if (rTimeframe === 'hour') stepSeconds = 3600;
    if (rTimeframe === 'minute') stepSeconds = 60;

    const nowSec = Math.floor(Date.now() / 1000);
    const gridNow = Math.floor(nowSec / stepSeconds) * stepSeconds;

    // NO PERFORMANCE CAP NEEDED - all ranges now use optimal point counts
    const simStep = stepSeconds;
    const simLimit = rLimit;

    let timePoints = [];
    for (let i = simLimit; i >= 0; i--) {
        const ts = gridNow - (i * simStep);
        if (ts <= nowSec) timePoints.push(ts);
    }
    if (nowSec - timePoints[timePoints.length - 1] > 1) timePoints.push(nowSec);

    // --- 2. FETCH HISTORY ---
    const historyMap = {};
    const symbolsToFetch = Array.from(significantSymbols);

    if (symbolsToFetch.length > 0) {
        await Promise.all(
            symbolsToFetch.map(async (sym) => {
                try {
                    const data = await fetchCandles(sym, currency, rTimeframe, rLimit + 20);
                    if (data && data.length) data.sort((a, b) => a.time - b.time);
                    historyMap[sym] = data || [];
                } catch (err) {
                    historyMap[sym] = [];
                    console.error(`Error fetching history for ${sym}:`, err);
                }
            })
        );
    }

    // --- 3. EFFICIENT SIMULATION ---
    const sortedTxns = [...allTxns].sort((a, b) => {
        const da = new Date(a.dateISO || a.date_iso).getTime();
        const db = new Date(b.dateISO || b.date_iso).getTime();
        return da - db;
    });

    const quantities = {};
    let txnPointer = 0;
    const historyPointers = {};
    symbolsToFetch.forEach(s => historyPointers[s] = 0);

    let graphPoints = timePoints.map(tPoint => {
        while (txnPointer < sortedTxns.length) {
            const t = sortedTxns[txnPointer];
            const tTime = new Date(t.dateISO || t.date_iso).getTime() / 1000;
            if (tTime > tPoint) break;

            if (!quantities[t.symbol]) quantities[t.symbol] = 0;
            if (['BUY', 'DEPOSIT', 'RECEIVE'].includes(t.way)) quantities[t.symbol] += t.amount;
            if (['SELL', 'WITHDRAW', 'SEND'].includes(t.way)) quantities[t.symbol] -= t.amount;
            txnPointer++;
        }

        let val = 0;
        for (const [sym, qty] of Object.entries(quantities)) {
            if (qty <= MIN_QUANTITY) continue;
            const hist = historyMap[sym];
            if (!hist || hist.length === 0) continue;

            let ptr = historyPointers[sym] || 0;
            while (ptr < hist.length - 1 && hist[ptr + 1].time <= tPoint) {
                ptr++;
            }
            historyPointers[sym] = ptr;

            // If data is too old compared to point, maybe use it anyway if it's the last known price?
            // Existing logic uses it if within simStep.
            // Let's stick to existing logic for now.
            if (hist[ptr].time <= tPoint + simStep) {
                val += qty * hist[ptr].close;
            }
        }
        return { timestamp: tPoint * 1000, value: val };
    });

    const endTime = Date.now();
    // console.log(`[PERF] Graph Simulation: ${endTime - startTime}ms (${graphPoints.length} points)`);

    // --- 4. POST-PROCESS ---
    const firstActiveIndex = graphPoints.findIndex(p => p.value > 0.0001);

    // Only slice if we are in a long-term view where 0-value start isn't useful context
    // Actually, original logic was:
    if (firstActiveIndex > 0 && ['1M', '1Y', 'ALL'].includes(range)) {
        graphPoints = graphPoints.slice(firstActiveIndex);
    }

    let delta = { val: 0, pct: 0 };
    let chartColor = '#94a3b8';

    if (graphPoints.length > 0) {
        const startVal = graphPoints[0].value;
        const endVal = graphPoints[graphPoints.length - 1].value;
        const diff = endVal - startVal;
        const pct = startVal > 0.0001 ? (diff / startVal) * 100 : 0;
        delta = { val: diff, pct };
        chartColor = diff >= 0 ? '#22c55e' : '#ef4444';
    }

    // --- 5. ASSET PERFORMANCE ---
    const getAssetPerformance = (item, history, r, rangeStart) => {
        const { price, quantity, change24h } = item;
        if (r === '1D') {
            const startPrice = price / (1 + (change24h / 100));
            return { val: (price - startPrice) * quantity, pct: change24h };
        }
        if (!history || history.length === 0) return { val: 0, pct: 0 };

        // Find the candle closest to rangeStart (within tolerance)
        // Look for candle at or after rangeStart, or closest before it
        let bestCandle = null;
        let bestDiff = Infinity;
        
        for (const candle of history) {
            const diff = Math.abs(candle.time - rangeStart);
            if (diff < bestDiff) {
                bestDiff = diff;
                bestCandle = candle;
            }
            // If we've found a candle at or after rangeStart, use it
            if (candle.time >= rangeStart) {
                bestCandle = candle;
                break;
            }
        }
        
        // Fallback: if no good candle found, use first candle
        if (!bestCandle && history.length > 0) {
            bestCandle = history[0];
        }
        
        if (!bestCandle) return { val: 0, pct: 0 };
        
        const startPrice = bestCandle.open || bestCandle.close;

        if (startPrice > 0) {
            const diff = price - startPrice;
            return { val: diff * quantity, pct: (diff / startPrice) * 100 };
        }
        return { val: 0, pct: 0 };
    };

    const newCoinDeltas = {};
    // timePoints are in seconds. rangeStart shoud be seconds.
    const rangeStart = timePoints[0];

    if (currentPortfolio) {
        currentPortfolio.forEach(item => {
            newCoinDeltas[item.symbol] = getAssetPerformance(item, historyMap[item.symbol], range, rangeStart);
        });
    }

    return {
        chartData: graphPoints,
        chartColor,
        delta,
        coinDeltas: newCoinDeltas
    };
};
