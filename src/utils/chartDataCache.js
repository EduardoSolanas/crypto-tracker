import { downsampleCandleData, downsampleLineData } from './chartSampling';

export const RANGE_SECONDS = {
    '1H': 3600,
    '1D': 86400,
    '1W': 7 * 86400,
    '1M': 30 * 86400,
    '1Y': 365 * 86400,
};

/**
 * Returns master fetching parameters for a given range.
 * 1D and 1W share the 7-day hourly master series (168 candles).
 * 1M, 1Y, and ALL share the daily master series (365+ candles).
 * 1H uses the minute master series (60 candles).
 */
export function getMasterTimeframeParams(range, options = {}) {
    switch (range) {
        case '1H':
            return { timeframe: 'minute', limit: 60, aggregate: 1 };
        case '1D':
        case '1W':
            return { timeframe: 'hour', limit: 168, aggregate: 1 };
        case '1M':
        case '1Y':
            return { timeframe: 'day', limit: 365, aggregate: 1 };
        case 'ALL': {
            const { earliestTxMs, nowMs = Date.now() } = options;
            if (earliestTxMs && earliestTxMs > 0 && earliestTxMs < nowMs) {
                const days = Math.max(30, Math.ceil((nowMs - earliestTxMs) / 86400000));
                return { timeframe: 'day', limit: Math.min(2000, days), aggregate: 1 };
            }
            return { timeframe: 'day', limit: 2000, aggregate: 1 };
        }
        default:
            return { timeframe: 'hour', limit: 168, aggregate: 1 };
    }
}

/**
 * Slices a subset of candles corresponding to the specified time window.
 */
export function sliceCandlesForRange(candles, range, nowSec = Math.floor(Date.now() / 1000)) {
    if (!Array.isArray(candles) || candles.length === 0) return [];
    if (range === 'ALL') return [...candles];

    const windowSec = RANGE_SECONDS[range];
    if (!windowSec) return [...candles];

    const cutoff = nowSec - windowSec;
    // Find the first candle that is within or immediately before the window
    const firstIndex = candles.findIndex(c => c.time >= cutoff);
    if (firstIndex === -1) {
        // All candles are older than cutoff, return last candle if exists
        return candles.length > 0 ? [candles[candles.length - 1]] : [];
    }

    const startIndex = Math.max(0, firstIndex > 0 ? firstIndex - 1 : 0);
    return candles.slice(startIndex);
}

/**
 * Prepares downsampled, simplified line points and pre-calculates min and max values.
 */
export function prepareSimplifiedLinePoints(rawPoints, maxPoints = 50) {
    if (!Array.isArray(rawPoints) || rawPoints.length === 0) {
        return { points: [], min: 0, max: 0 };
    }

    const sampled = downsampleLineData(rawPoints, maxPoints);
    let min = Infinity;
    let max = -Infinity;

    for (let i = 0; i < sampled.length; i++) {
        const val = sampled[i].value;
        if (val < min) min = val;
        if (val > max) max = val;
    }

    if (!Number.isFinite(min)) min = 0;
    if (!Number.isFinite(max)) max = 0;

    return {
        points: sampled,
        min,
        max
    };
}

/**
 * Prepares downsampled, simplified candlestick data and pre-calculates extrema.
 */
export function prepareSimplifiedCandles(rawCandles, maxPoints = 50) {
    if (!Array.isArray(rawCandles) || rawCandles.length === 0) {
        return { candles: [], min: 0, max: 0 };
    }

    const sampled = downsampleCandleData(rawCandles, maxPoints);
    let min = Infinity;
    let max = -Infinity;

    for (let i = 0; i < sampled.length; i++) {
        const c = sampled[i];
        if (c.low < min) min = c.low;
        if (c.high > max) max = c.high;
    }

    if (!Number.isFinite(min)) min = 0;
    if (!Number.isFinite(max)) max = 0;

    return {
        candles: sampled,
        min,
        max
    };
}
