import { COIN_CHART_RANGES, getCoinChartFetchParams } from '../coinChartRange';

describe('coinChartRange', () => {
    it('exposes the expected selectable view modes', () => {
        expect(COIN_CHART_RANGES).toEqual(['1H', '1D', '1W', '1M', '1Y', 'ALL']);
    });

    describe('1H mode agent', () => {
        it('maps to minute candles for one hour', () => {
            expect(getCoinChartFetchParams('1H')).toEqual({
                timeframe: 'minute',
                limit: 12,
                aggregate: 5,
            });
        });
    });

    describe('1D mode agent', () => {
        it('maps to hourly candles with 1-hour buckets', () => {
            expect(getCoinChartFetchParams('1D')).toEqual({
                timeframe: 'hour',
                limit: 24,
                aggregate: 1,
            });
        });
    });

    describe('1W mode agent', () => {
        it('maps to hourly candles with 4-hour aggregation', () => {
            expect(getCoinChartFetchParams('1W')).toEqual({
                timeframe: 'hour',
                limit: 42,
                aggregate: 4,
            });
        });
    });

    describe('1M mode agent', () => {
        it('maps to daily candles for one month', () => {
            expect(getCoinChartFetchParams('1M')).toEqual({
                timeframe: 'day',
                limit: 30,
                aggregate: 1,
            });
        });
    });

    describe('1Y mode agent', () => {
        it('maps to daily candles for one year with 3-day aggregation', () => {
            expect(getCoinChartFetchParams('1Y')).toEqual({
                timeframe: 'day',
                limit: 122,
                aggregate: 3,
            });
        });
    });

    describe('ALL mode agent', () => {
        it('maps to long-range daily candles with aggregation', () => {
            expect(getCoinChartFetchParams('ALL')).toEqual({
                timeframe: 'day',
                limit: 100,
                aggregate: 7,
            });
        });

        it('expands dynamically from earliest transaction time', () => {
            const nowMs = new Date('2026-02-28T00:00:00.000Z').getTime();
            const earliestTxMs = new Date('2022-01-01T00:00:00.000Z').getTime();
            // Days = ~1519. Target 100 pts. Agg = ceil(1519/100) = 16. Limit = ceil(1519/16) = 95.

            expect(getCoinChartFetchParams('ALL', { earliestTxMs, nowMs })).toEqual({
                timeframe: 'day',
                limit: 95,
                aggregate: 16,
            });
        });
    });

    it('falls back to 1D mapping for unknown ranges', () => {
        expect(getCoinChartFetchParams('UNKNOWN')).toEqual({
            timeframe: 'hour',
            limit: 24,
            aggregate: 1,
        });
    });
});
