import { downsampleCandleData, downsampleLineData, smoothLineData } from '../chartSampling';

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

    it('smoothLineData smooths intermediate points while preserving first and last values', () => {
        const data = [
            { timestamp: 1, value: 100 },
            { timestamp: 2, value: 150 },
            { timestamp: 3, value: 80 },
            { timestamp: 4, value: 200 },
            { timestamp: 5, value: 120 }
        ];

        const smoothed = smoothLineData(data);
        expect(smoothed.length).toBe(5);
        expect(smoothed[0].value).toBe(100);
        expect(smoothed[smoothed.length - 1].value).toBe(120);
        // index 1: 0.25*100 + 0.5*150 + 0.25*80 = 25 + 75 + 20 = 120
        expect(smoothed[1].value).toBe(120);
    });

    it('smoothLineData handles short arrays and invalid inputs gracefully', () => {
        expect(smoothLineData([])).toEqual([]);
        expect(smoothLineData(null)).toEqual([]);
        const short = [{ timestamp: 1, value: 10 }, { timestamp: 2, value: 20 }];
        expect(smoothLineData(short)).toEqual(short);
    });
});
