import { downsampleCandleData, downsampleLineData } from '../chartSampling';

describe('chartSampling', () => {
    it('keeps first and last points for line sampling', () => {
        const data = Array.from({ length: 200 }, (_, i) => ({
            timestamp: i,
            value: i % 2 === 0 ? i : i - 20,
        }));

        const sampled = downsampleLineData(data, 60);
        expect(sampled.length).toBeLessThanOrEqual(60);
        expect(sampled[0]).toEqual(data[0]);
        expect(sampled[sampled.length - 1]).toEqual(data[data.length - 1]);
    });

    it('does not sample when under max points', () => {
        const data = Array.from({ length: 20 }, (_, i) => ({ timestamp: i, value: i }));
        expect(downsampleLineData(data, 100)).toEqual(data);
        expect(downsampleCandleData(data, 100)).toEqual(data);
    });

    it('keeps first and last candles for candle sampling', () => {
        const data = Array.from({ length: 180 }, (_, i) => ({
            timestamp: i,
            open: 100 + i,
            high: 110 + i + (i % 5),
            low: 95 + i - (i % 3),
            close: 102 + i,
        }));

        const sampled = downsampleCandleData(data, 50);
        expect(sampled.length).toBeLessThanOrEqual(50);
        expect(sampled[0]).toEqual(data[0]);
        expect(sampled[sampled.length - 1]).toEqual(data[data.length - 1]);
    });
});
