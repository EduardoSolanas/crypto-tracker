import { COIN_CHART_RANGES, getCoinChartFetchParams } from '../coinChartRange';

describe('coinChartRange', () => {
    it('exposes the expected selectable view modes', () => {
        expect(COIN_CHART_RANGES).toEqual(['1H', '1D', '1W', '1M', '1Y', 'ALL']);
    });

    describe('1H mode agent', () => {
        it('maps to minute candles for one hour', () => {
            expect(getCoinChartFetchParams('1H')).toEqual({
                timeframe: 'minute',
                limit: 60,
                aggregate: 1,
            });
        });
    });

    describe('1D mode agent', () => {
        it('maps to minute candles with 12-minute buckets', () => {
            expect(getCoinChartFetchParams('1D')).toEqual({
                timeframe: 'minute',
                limit: 120,
                aggregate: 12,
            });
        });
    });

    describe('1W mode agent', () => {
        it('maps to hourly candles with 2-hour aggregation', () => {
            expect(getCoinChartFetchParams('1W')).toEqual({
                timeframe: 'hour',
                limit: 84,
                aggregate: 2,
            });
        });
    });

    describe('1M mode agent', () => {
        it('maps to hourly candles with 6-hour aggregation', () => {
            expect(getCoinChartFetchParams('1M')).toEqual({
                timeframe: 'hour',
                limit: 120,
                aggregate: 6,
            });
        });
    });

    describe('1Y mode agent', () => {
        it('maps to daily candles for one year', () => {
            expect(getCoinChartFetchParams('1Y')).toEqual({
                timeframe: 'day',
                limit: 365,
                aggregate: 1,
            });
        });
    });

    describe('ALL mode agent', () => {
        it('maps to long-range daily candles with aggregation', () => {
            expect(getCoinChartFetchParams('ALL')).toEqual({
                timeframe: 'day',
                limit: 200,
                aggregate: 5,
            });
        });

        it('expands dynamically from earliest transaction time', () => {
            const nowMs = new Date('2026-02-28T00:00:00.000Z').getTime();
            const earliestTxMs = new Date('2022-01-01T00:00:00.000Z').getTime();

            expect(getCoinChartFetchParams('ALL', { earliestTxMs, nowMs })).toEqual({
                timeframe: 'day',
                limit: 190,
                aggregate: 8,
            });
        });
    });

    it('falls back to 1D mapping for unknown ranges', () => {
        expect(getCoinChartFetchParams('UNKNOWN')).toEqual({
            timeframe: 'minute',
            limit: 120,
            aggregate: 12,
        });
    });
});
