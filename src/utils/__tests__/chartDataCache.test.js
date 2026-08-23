import {
    sliceCandlesForRange,
    prepareSimplifiedLinePoints,
    prepareSimplifiedCandles,
    getMasterTimeframeParams,
    aggregateCandleBuckets
} from '../chartDataCache';

describe('chartDataCache', () => {
    const nowSec = 1700000000;
    
    // Generate 7 days of hourly mock candles (168 candles)
    const mockHourlyCandles = Array.from({ length: 168 }, (_, i) => {
        const time = nowSec - (167 - i) * 3600;
        return {
            time,
            open: 100 + i,
            high: 105 + i,
            low: 95 + i,
            close: 102 + i,
        };
    });

    // Generate 365 days of daily mock candles
    const mockDailyCandles = Array.from({ length: 365 }, (_, i) => {
        const time = nowSec - (364 - i) * 86400;
        return {
            time,
            open: 50 + i * 0.5,
            high: 55 + i * 0.5,
            low: 45 + i * 0.5,
            close: 52 + i * 0.5,
        };
    });

    describe('aggregateCandleBuckets', () => {
        it('aggregates 60 1-minute candles into 12 5-minute candles with correct OHLC', () => {
            const mockMinuteCandles = Array.from({ length: 60 }, (_, i) => ({
                time: 1700000000 + i * 60,
                open: 100 + i,
                high: 105 + i,
                low: 95 + i,
                close: 102 + i,
                volumefrom: 10,
                volumeto: 1000
            }));

            const aggregated = aggregateCandleBuckets(mockMinuteCandles, 300); // 5-minute buckets
            expect(aggregated.length).toBe(12);

            // First bucket (indices 0..4)
            expect(aggregated[0].open).toBe(100); // open of index 0
            expect(aggregated[0].close).toBe(106); // close of index 4 (102 + 4)
            expect(aggregated[0].high).toBe(109); // high of index 4 (105 + 4)
            expect(aggregated[0].low).toBe(95); // low of index 0
            expect(aggregated[0].volumefrom).toBe(50);
        });

        it('returns raw array if bucket duration is 60s or empty', () => {
            const raw = [{ time: 1000, open: 1, high: 2, low: 0.5, close: 1.5 }];
            expect(aggregateCandleBuckets(raw, 60)).toEqual(raw);
            expect(aggregateCandleBuckets([], 300)).toEqual([]);
            expect(aggregateCandleBuckets(null, 300)).toEqual([]);
        });
    });

    describe('sliceCandlesForRange', () => {
        it('slices 1D (24h) from hourly master candles', () => {
            const sliced = sliceCandlesForRange(mockHourlyCandles, '1D', nowSec);
            expect(sliced.length).toBeGreaterThanOrEqual(24);
            expect(sliced.length).toBeLessThanOrEqual(26);
            expect(sliced[0].time).toBeGreaterThanOrEqual(nowSec - 86400 - 3600);
            expect(sliced[sliced.length - 1].time).toBe(nowSec);
        });

        it('returns full 1W (7d) from hourly master candles', () => {
            const sliced = sliceCandlesForRange(mockHourlyCandles, '1W', nowSec);
            expect(sliced.length).toBe(168);
        });

        it('slices 1M (30d) from daily master candles', () => {
            const sliced = sliceCandlesForRange(mockDailyCandles, '1M', nowSec);
            expect(sliced.length).toBeGreaterThanOrEqual(30);
            expect(sliced.length).toBeLessThanOrEqual(32);
            expect(sliced[0].time).toBeGreaterThanOrEqual(nowSec - (30 * 86400) - 86400);
        });

        it('slices 1Y (365d) from daily master candles', () => {
            const sliced = sliceCandlesForRange(mockDailyCandles, '1Y', nowSec);
            expect(sliced.length).toBe(365);
        });

        it('returns all candles for ALL range', () => {
            const sliced = sliceCandlesForRange(mockDailyCandles, 'ALL', nowSec);
            expect(sliced.length).toBe(365);
        });

        it('returns empty array safely if input is invalid', () => {
            expect(sliceCandlesForRange(null, '1D')).toEqual([]);
            expect(sliceCandlesForRange([], '1D')).toEqual([]);
        });
    });

    describe('prepareSimplifiedLinePoints', () => {
        it('downsamples raw points and computes accurate min and max', () => {
            const rawPoints = Array.from({ length: 200 }, (_, i) => ({
                timestamp: nowSec * 1000 + i * 60000,
                value: 1000 + Math.sin(i) * 500,
            }));

            const result = prepareSimplifiedLinePoints(rawPoints, 40);
            expect(result.points.length).toBeLessThanOrEqual(40);
            expect(result.points.length).toBeGreaterThanOrEqual(10);
            expect(result.min).toBeCloseTo(Math.min(...rawPoints.map(p => p.value)));
            expect(result.max).toBeCloseTo(Math.max(...rawPoints.map(p => p.value)));
            // Preserves first and last timestamp
            expect(result.points[0].timestamp).toBe(rawPoints[0].timestamp);
            expect(result.points[result.points.length - 1].timestamp).toBe(rawPoints[rawPoints.length - 1].timestamp);
        });

        it('handles small datasets without dropping points', () => {
            const smallPoints = [
                { timestamp: 1000, value: 50 },
                { timestamp: 2000, value: 80 },
                { timestamp: 3000, value: 60 },
            ];
            const result = prepareSimplifiedLinePoints(smallPoints, 40);
            expect(result.points).toEqual(smallPoints);
            expect(result.min).toBe(50);
            expect(result.max).toBe(80);
        });

        it('returns safe fallback for empty input', () => {
            expect(prepareSimplifiedLinePoints([])).toEqual({ points: [], min: 0, max: 0 });
            expect(prepareSimplifiedLinePoints(null)).toEqual({ points: [], min: 0, max: 0 });
        });
    });

    describe('prepareSimplifiedCandles', () => {
        it('downsamples raw candles and computes high max / low min', () => {
            const result = prepareSimplifiedCandles(mockHourlyCandles, 40);
            expect(result.candles.length).toBeLessThanOrEqual(40);
            expect(result.min).toBe(Math.min(...mockHourlyCandles.map(c => c.low)));
            expect(result.max).toBe(Math.max(...mockHourlyCandles.map(c => c.high)));
        });

        it('returns safe fallback for empty candles', () => {
            expect(prepareSimplifiedCandles([])).toEqual({ candles: [], min: 0, max: 0 });
            expect(prepareSimplifiedCandles(null)).toEqual({ candles: [], min: 0, max: 0 });
        });
    });

    describe('getMasterTimeframeParams', () => {
        it('maps 1D and 1W to the hourly master timeframe', () => {
            expect(getMasterTimeframeParams('1D')).toEqual({ timeframe: 'hour', limit: 168, aggregate: 1 });
            expect(getMasterTimeframeParams('1W')).toEqual({ timeframe: 'hour', limit: 168, aggregate: 1 });
        });

        it('maps 1M, 1Y, and ALL to the daily master timeframe', () => {
            expect(getMasterTimeframeParams('1M')).toEqual({ timeframe: 'day', limit: 365, aggregate: 1 });
            expect(getMasterTimeframeParams('1Y')).toEqual({ timeframe: 'day', limit: 365, aggregate: 1 });
            expect(getMasterTimeframeParams('ALL')).toEqual({ timeframe: 'day', limit: 2000, aggregate: 1 });
        });

        it('maps 1H to minute timeframe', () => {
            expect(getMasterTimeframeParams('1H')).toEqual({ timeframe: 'minute', limit: 60, aggregate: 1 });
        });
    });
});
