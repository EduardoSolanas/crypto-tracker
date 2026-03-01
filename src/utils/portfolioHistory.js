import { toLinePoint } from './chartContracts';

// Named constants for magic numbers
const SIGNIFICANT_VALUE_THRESHOLD = 10;  // Minimum asset value to fetch history for
const MIN_QUANTITY = 0.00000001;  // Dust threshold for filtering tiny amounts

export const computePortfolioHistory = async ({
    allTxns,
    currentPortfolio,
    currency,
    range,
    fetchCandles
}) => {
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
            chartData: [toLinePoint(now - 86400000, 0), toLinePoint(now, 0)]
        };
    }

    // FILTER: Only fetch history for assets with value > SIGNIFICANT_VALUE_THRESHOLD
    const significantSymbols = new Set();
    if (currentPortfolio) {
        currentPortfolio.forEach(p => {
            if (p.value > SIGNIFICANT_VALUE_THRESHOLD) significantSymbols.add(p.symbol);
        });
    }

    // --- 1. PARAMS & TIME POINTS ---
    // Find the earliest transaction date for ALL range
    const sortedTxnDates = allTxns
        .map(t => new Date(t.dateISO || t.date_iso).getTime())
        .sort((a, b) => a - b);
    const earliestTxnTime = sortedTxnDates[0] / 1000; // in seconds
    
    const nowSec = Math.floor(Date.now() / 1000);
    
    let rLimit = 30;
    let rTimeframe = 'day';
    let rAggregate = 1;
    
    switch (range) {
        case '1H': 
            // 1h should use minute candles; hourly candles make this view stale/inaccurate.
            rTimeframe = 'minute'; 
            rLimit = 60;
            rAggregate = 1;
            break;
        case '1D': 
            rTimeframe = 'hour'; 
            rLimit = 24; 
            rAggregate = 1;
            break;
        case '1W': 
            rTimeframe = 'hour'; 
            // 7 days * 24h = 168h.
            rLimit = 168;
            rAggregate = 1;
            break;
        case '1M': 
            rTimeframe = 'day'; 
            rLimit = 30; 
            rAggregate = 1;
            break;
        case '1Y': 
            rTimeframe = 'day'; 
            rLimit = 365; 
            rAggregate = 1;
            break;
        case 'ALL': {
            // Calculate days since first transaction
            const daysSinceFirst = Math.ceil((nowSec - earliestTxnTime) / 86400);
            rTimeframe = 'day';
            // Use at least 30 days, cap at 2000 (API limit)
            rLimit = Math.min(Math.max(daysSinceFirst, 30), 2000);
            rAggregate = Math.max(1, Math.ceil(rLimit / 200));
            break;
        }
        default: 
            rTimeframe = 'day'; 
            rLimit = 30;
            rAggregate = 1;
    }

    let stepSeconds = 86400;
    if (rTimeframe === 'hour') stepSeconds = 3600;
    if (rTimeframe === 'minute') stepSeconds = 60;
    stepSeconds *= rAggregate;

    const gridNow = Math.floor(nowSec / stepSeconds) * stepSeconds;

    // For 1H view, we want hourly data points but only show the last hour
    let simStep = stepSeconds;
    let simLimit = rLimit;
    
    if (range === '1H') {
        // Show 12 data points over the last hour (5-minute intervals).
        simLimit = 12;
        simStep = 300; // 5 minute intervals for display
    }
    if (range === '1W') {
        // Keep chart readable while still spanning the full week.
        simStep = 7200; // 2-hour intervals
        simLimit = 84;  // 7 days * 12 points/day
    }

    // For ALL and 1Y, sample data points to avoid too many
    if (range === 'ALL' || range === '1Y') {
        const targetPoints = 50;
        if (rLimit > targetPoints) {
            simStep = Math.floor((rLimit * 86400) / targetPoints);
            simLimit = targetPoints;
        }
    }

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
                    const data = await fetchCandles(sym, currency, rTimeframe, rLimit + 20, rAggregate);
                    if (data && data.length) data.sort((a, b) => a.time - b.time);
                    historyMap[sym] = data || [];
                } catch (err) {
                    historyMap[sym] = [];
                    if (globalThis.__DEV__) {
                        console.error(`Error fetching history for ${sym}:`, err);
                    }
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
        return toLinePoint(tPoint * 1000, val);
    });

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
            // Early exit if we've passed rangeStart (no need to check further)
            if (candle.time >= rangeStart) {
                break;
            }
        }

        // bestCandle is guaranteed to be set if history.length > 0
        if (!bestCandle) return { val: 0, pct: 0 };

        const startPrice = bestCandle.open || bestCandle.close || 0;

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
