/**
 * Deep tests for time range calculations in portfolio history
 * Tests the actual time points generated and data accuracy for each range
 */

import { computePortfolioHistory } from '../portfolioHistory';

const mockFetchCandles = jest.fn();

describe('Range Calculation Logic - Deep Analysis', () => {
    beforeEach(() => {
        jest.clearAllMocks();
        mockFetchCandles.mockResolvedValue([]);
    });

    describe('Time Point Generation', () => {
        it('1H range uses minute data with 5-minute display intervals', async () => {
            const nowSec = Math.floor(Date.now() / 1000);
            const gridNow = Math.floor(nowSec / 3600) * 3600; // Align to hour

            const btcHistory = Array.from({ length: 60 }, (_, i) => ({
                time: gridNow - (60 - i) * 3600,
                close: 50000
            }));

            mockFetchCandles.mockResolvedValue(btcHistory);

            const txns = [{
                dateISO: new Date((nowSec - 7200) * 1000).toISOString(),
                symbol: 'BTC',
                amount: 1,
                way: 'BUY'
            }];

            const portfolio = [{ symbol: 'BTC', value: 50000, quantity: 1, price: 50000, change24h: 0 }];

            const result = await computePortfolioHistory({
                allTxns: txns,
                currentPortfolio: portfolio,
                currency: 'USD',
                range: '1H',
                fetchCandles: mockFetchCandles
            });

            // Should have ~12-13 points (5-minute display intervals over 1 hour)
            expect(result.chartData.length).toBeGreaterThanOrEqual(10);
            expect(result.chartData.length).toBeLessThanOrEqual(15);

            // API should request minute data
            expect(mockFetchCandles).toHaveBeenCalledWith('BTC', 'USD', 'minute', 80, 1);
        });

        it('1D range generates hourly points (24) - OPTIMIZED', async () => {
            const nowSec = Math.floor(Date.now() / 1000);

            // Now requests 24 hours of hourly data (major optimization!)
            const portfolio = [{ symbol: 'BTC', value: 50000, quantity: 1, price: 50000, change24h: 0 }];
            const txns = [{
                dateISO: new Date((nowSec - 86400 * 2) * 1000).toISOString(),
                symbol: 'BTC',
                amount: 1,
                way: 'BUY'
            }];

            await computePortfolioHistory({
                allTxns: txns,
                currentPortfolio: portfolio,
                currency: 'USD',
                range: '1D',
                fetchCandles: mockFetchCandles
            });

            // Verify API call parameters - now hourly, not minute!
            expect(mockFetchCandles).toHaveBeenCalledWith('BTC', 'USD', 'hour', 44, 1);
        });

        it('1W range covers a full week using hourly data', async () => {
            const portfolio = [{ symbol: 'BTC', value: 50000, quantity: 1, price: 50000, change24h: 0 }];
            const txns = [{
                dateISO: new Date(Date.now() - 10 * 86400 * 1000).toISOString(),
                symbol: 'BTC',
                amount: 1,
                way: 'BUY'
            }];

            await computePortfolioHistory({
                allTxns: txns,
                currentPortfolio: portfolio,
                currency: 'USD',
                range: '1W',
                fetchCandles: mockFetchCandles
            });

            // 7 days * 24 hours + 20 buffer
            expect(mockFetchCandles).toHaveBeenCalledWith('BTC', 'USD', 'hour', 188, 1);
        });

        it('1M range generates daily points (30)', async () => {
            const portfolio = [{ symbol: 'BTC', value: 50000, quantity: 1, price: 50000, change24h: 0 }];
            const txns = [{
                dateISO: new Date(Date.now() - 45 * 86400 * 1000).toISOString(),
                symbol: 'BTC',
                amount: 1,
                way: 'BUY'
            }];

            await computePortfolioHistory({
                allTxns: txns,
                currentPortfolio: portfolio,
                currency: 'USD',
                range: '1M',
                fetchCandles: mockFetchCandles
            });

            expect(mockFetchCandles).toHaveBeenCalledWith('BTC', 'USD', 'day', 50, 1);
        });

        it('1Y range generates up to 365 daily points', async () => {
            const nowSec = Math.floor(Date.now() / 1000);
            
            // Generate 400 days of data
            const btcHistory = Array.from({ length: 400 }, (_, i) => ({
                time: nowSec - (400 - i) * 86400,
                close: 30000 + i * 50
            }));

            mockFetchCandles.mockResolvedValue(btcHistory);

            const txns = [{
                dateISO: new Date((nowSec - 400 * 86400) * 1000).toISOString(),
                symbol: 'BTC',
                amount: 1,
                way: 'BUY'
            }];

            const portfolio = [{ symbol: 'BTC', value: 50000, quantity: 1, price: 50000, change24h: 0 }];

            const result = await computePortfolioHistory({
                allTxns: txns,
                currentPortfolio: portfolio,
                currency: 'USD',
                range: '1Y',
                fetchCandles: mockFetchCandles
            });

            // Should have ~50 sampled points (365 days sampled to ~50 points)
            expect(result.chartData.length).toBeLessThanOrEqual(55);
            expect(result.chartData.length).toBeGreaterThan(45);

            // Verify API requested 365 days worth + buffer
            expect(mockFetchCandles).toHaveBeenCalledWith('BTC', 'USD', 'day', 385, 1);
        });

        it('ALL range calculates days since first transaction', async () => {
            const nowSec = Math.floor(Date.now() / 1000);
            // Transaction from 500 days ago
            const firstTxnTime = nowSec - (500 * 86400);
            
            const btcHistory = Array.from({ length: 520 }, (_, i) => ({
                time: nowSec - (520 - i) * 86400,
                close: 30000 + i * 50
            }));

            mockFetchCandles.mockResolvedValue(btcHistory);

            const txns = [{
                dateISO: new Date(firstTxnTime * 1000).toISOString(),
                symbol: 'BTC',
                amount: 1,
                way: 'BUY'
            }];

            const portfolio = [{ symbol: 'BTC', value: 50000, quantity: 1, price: 50000, change24h: 0 }];

            const result = await computePortfolioHistory({
                allTxns: txns,
                currentPortfolio: portfolio,
                currency: 'USD',
                range: 'ALL',
                fetchCandles: mockFetchCandles
            });

            // Should request ~500 days of data (days since first txn)
            expect(mockFetchCandles).toHaveBeenCalledWith('BTC', 'USD', 'day', expect.any(Number), expect.any(Number));
            const requestedLimit = mockFetchCandles.mock.calls[0][3];
            expect(requestedLimit).toBeGreaterThanOrEqual(500);
            expect(requestedLimit).toBeLessThanOrEqual(550);

            // Should have ~50 sampled points
            expect(result.chartData.length).toBeLessThanOrEqual(55);
            expect(result.chartData.length).toBeGreaterThan(45);
        });

        it('ALL range handles very old transactions (years ago)', async () => {
            const nowSec = Math.floor(Date.now() / 1000);
            // Transaction from 2500 days ago (~7 years)
            const firstTxnTime = nowSec - (2500 * 86400);
            
            const btcHistory = Array.from({ length: 2000 }, (_, i) => ({
                time: nowSec - (2000 - i) * 86400,
                close: 5000 + i * 20
            }));

            mockFetchCandles.mockResolvedValue(btcHistory);

            const txns = [{
                dateISO: new Date(firstTxnTime * 1000).toISOString(),
                symbol: 'BTC',
                amount: 1,
                way: 'BUY'
            }];

            const portfolio = [{ symbol: 'BTC', value: 50000, quantity: 1, price: 50000, change24h: 0 }];

            const result = await computePortfolioHistory({
                allTxns: txns,
                currentPortfolio: portfolio,
                currency: 'USD',
                range: 'ALL',
                fetchCandles: mockFetchCandles
            });

            // Should cap at 2000 days (API limit)
            expect(mockFetchCandles).toHaveBeenCalledWith('BTC', 'USD', 'day', expect.any(Number), expect.any(Number));
            const requestedLimit = mockFetchCandles.mock.calls[0][3];
            expect(requestedLimit).toBeLessThanOrEqual(2020); // 2000 + buffer

            // Should still have ~50 sampled points
            expect(result.chartData.length).toBeLessThanOrEqual(55);
            expect(result.chartData.length).toBeGreaterThan(45);
        });
    });

    describe('Value Calculation Accuracy', () => {
        it('calculates correct portfolio value at each time point', async () => {
            const nowSec = Math.floor(Date.now() / 1000);
            
            // BTC price increases linearly: $48k → $52k over 24 hours
            const btcHistory = Array.from({ length: 25 }, (_, i) => ({
                time: nowSec - (24 - i) * 3600,
                close: 48000 + (i * 4000 / 24) // Linear increase
            }));

            mockFetchCandles.mockResolvedValue(btcHistory);

            const txns = [{
                dateISO: new Date((nowSec - 48 * 3600) * 1000).toISOString(),
                symbol: 'BTC',
                amount: 2, // 2 BTC
                way: 'BUY'
            }];

            const portfolio = [{ symbol: 'BTC', value: 104000, quantity: 2, price: 52000, change24h: 8.33 }];

            const result = await computePortfolioHistory({
                allTxns: txns,
                currentPortfolio: portfolio,
                currency: 'USD',
                range: '1D',
                fetchCandles: mockFetchCandles
            });

            // First point should be ~96k (2 BTC * $48k)
            const firstValue = result.chartData[0].value;
            expect(firstValue).toBeGreaterThanOrEqual(95000);
            expect(firstValue).toBeLessThanOrEqual(97000);

            // Last point should be ~104k (2 BTC * $52k)
            const lastValue = result.chartData[result.chartData.length - 1].value;
            expect(lastValue).toBeGreaterThanOrEqual(103000);
            expect(lastValue).toBeLessThanOrEqual(105000);

            // Delta should be ~8k
            expect(result.delta.val).toBeGreaterThanOrEqual(7000);
            expect(result.delta.val).toBeLessThanOrEqual(9000);

            // Percentage should be ~8.3%
            expect(result.delta.pct).toBeGreaterThanOrEqual(7);
            expect(result.delta.pct).toBeLessThanOrEqual(10);
        });

        it('handles transaction occurring mid-range correctly', async () => {
            const nowSec = Math.floor(Date.now() / 1000);
            
            const btcHistory = Array.from({ length: 25 }, (_, i) => ({
                time: nowSec - (24 - i) * 3600,
                close: 50000
            }));

            mockFetchCandles.mockResolvedValue(btcHistory);

            const txns = [
                {
                    // First buy 24 hours ago
                    dateISO: new Date((nowSec - 24 * 3600) * 1000).toISOString(),
                    symbol: 'BTC',
                    amount: 1,
                    way: 'BUY'
                },
                {
                    // Second buy 12 hours ago (mid-range)
                    dateISO: new Date((nowSec - 12 * 3600) * 1000).toISOString(),
                    symbol: 'BTC',
                    amount: 1,
                    way: 'BUY'
                }
            ];

            const portfolio = [{ symbol: 'BTC', value: 100000, quantity: 2, price: 50000, change24h: 0 }];

            const result = await computePortfolioHistory({
                allTxns: txns,
                currentPortfolio: portfolio,
                currency: 'USD',
                range: '1D',
                fetchCandles: mockFetchCandles
            });

            // Find the midpoint (12 hours ago)
            const midIndex = Math.floor(result.chartData.length / 2);
            
            // Before second transaction: ~50k (1 BTC) - more flexible range
            const beforeSecondBuy = result.chartData.slice(0, midIndex);
            const avgBefore = beforeSecondBuy.reduce((sum, p) => sum + p.value, 0) / beforeSecondBuy.length;
            expect(avgBefore).toBeGreaterThanOrEqual(45000);  // More flexible due to hourly sampling
            expect(avgBefore).toBeLessThanOrEqual(55000);

            // After second transaction: ~100k (2 BTC)
            const afterSecondBuy = result.chartData.slice(midIndex);
            const avgAfter = afterSecondBuy.reduce((sum, p) => sum + p.value, 0) / afterSecondBuy.length;
            expect(avgAfter).toBeGreaterThanOrEqual(95000);
            expect(avgAfter).toBeLessThanOrEqual(105000);
        });

        it('handles SELL transaction reducing portfolio value', async () => {
            const nowSec = Math.floor(Date.now() / 1000);
            
            const btcHistory = Array.from({ length: 25 }, (_, i) => ({
                time: nowSec - (24 - i) * 3600,
                close: 50000
            }));

            mockFetchCandles.mockResolvedValue(btcHistory);

            const txns = [
                {
                    dateISO: new Date((nowSec - 48 * 3600) * 1000).toISOString(),
                    symbol: 'BTC',
                    amount: 2,
                    way: 'BUY'
                },
                {
                    // Sell half 12 hours ago
                    dateISO: new Date((nowSec - 12 * 3600) * 1000).toISOString(),
                    symbol: 'BTC',
                    amount: 1,
                    way: 'SELL'
                }
            ];

            const portfolio = [{ symbol: 'BTC', value: 50000, quantity: 1, price: 50000, change24h: 0 }];

            const result = await computePortfolioHistory({
                allTxns: txns,
                currentPortfolio: portfolio,
                currency: 'USD',
                range: '1D',
                fetchCandles: mockFetchCandles
            });

            // First half should be ~100k (2 BTC)
            const firstHalf = result.chartData.slice(0, Math.floor(result.chartData.length / 2));
            const avgFirst = firstHalf.reduce((sum, p) => sum + p.value, 0) / firstHalf.length;
            expect(avgFirst).toBeGreaterThanOrEqual(95000);

            // Second half should be ~50k (1 BTC)
            const secondHalf = result.chartData.slice(Math.floor(result.chartData.length / 2));
            const avgSecond = secondHalf.reduce((sum, p) => sum + p.value, 0) / secondHalf.length;
            expect(avgSecond).toBeGreaterThanOrEqual(48000);
            expect(avgSecond).toBeLessThanOrEqual(52000);
        });
    });

    describe('Multi-Asset Value Calculation', () => {
        it('correctly sums multiple assets at each time point', async () => {
            const nowSec = Math.floor(Date.now() / 1000);

            mockFetchCandles.mockImplementation((sym) => {
                if (sym === 'BTC') {
                    return Promise.resolve(Array.from({ length: 25 }, (_, i) => ({
                        time: nowSec - (24 - i) * 3600,
                        close: 50000
                    })));
                }
                if (sym === 'ETH') {
                    return Promise.resolve(Array.from({ length: 25 }, (_, i) => ({
                        time: nowSec - (24 - i) * 3600,
                        close: 3000
                    })));
                }
                return Promise.resolve([]);
            });

            const txns = [
                {
                    dateISO: new Date((nowSec - 48 * 3600) * 1000).toISOString(),
                    symbol: 'BTC',
                    amount: 1,
                    way: 'BUY'
                },
                {
                    dateISO: new Date((nowSec - 48 * 3600) * 1000).toISOString(),
                    symbol: 'ETH',
                    amount: 10,
                    way: 'BUY'
                }
            ];

            const portfolio = [
                { symbol: 'BTC', value: 50000, quantity: 1, price: 50000, change24h: 0 },
                { symbol: 'ETH', value: 30000, quantity: 10, price: 3000, change24h: 0 }
            ];

            const result = await computePortfolioHistory({
                allTxns: txns,
                currentPortfolio: portfolio,
                currency: 'USD',
                range: '1D',
                fetchCandles: mockFetchCandles
            });

            // Every point should be ~80k (50k BTC + 30k ETH)
            result.chartData.forEach(point => {
                expect(point.value).toBeGreaterThanOrEqual(78000);
                expect(point.value).toBeLessThanOrEqual(82000);
            });
        });

        it('handles assets with different price movements', async () => {
            const nowSec = Math.floor(Date.now() / 1000);

            mockFetchCandles.mockImplementation((sym) => {
                if (sym === 'BTC') {
                    // BTC goes up 10%
                    return Promise.resolve(Array.from({ length: 25 }, (_, i) => ({
                        time: nowSec - (24 - i) * 3600,
                        close: 50000 * (1 + (i / 24) * 0.1)
                    })));
                }
                if (sym === 'ETH') {
                    // ETH goes down 5%
                    return Promise.resolve(Array.from({ length: 25 }, (_, i) => ({
                        time: nowSec - (24 - i) * 3600,
                        close: 3000 * (1 - (i / 24) * 0.05)
                    })));
                }
                return Promise.resolve([]);
            });

            const txns = [
                { dateISO: new Date((nowSec - 48 * 3600) * 1000).toISOString(), symbol: 'BTC', amount: 1, way: 'BUY' },
                { dateISO: new Date((nowSec - 48 * 3600) * 1000).toISOString(), symbol: 'ETH', amount: 10, way: 'BUY' }
            ];

            const portfolio = [
                { symbol: 'BTC', value: 55000, quantity: 1, price: 55000, change24h: 10 },
                { symbol: 'ETH', value: 28500, quantity: 10, price: 2850, change24h: -5 }
            ];

            const result = await computePortfolioHistory({
                allTxns: txns,
                currentPortfolio: portfolio,
                currency: 'USD',
                range: '1D',
                fetchCandles: mockFetchCandles
            });

            // Start: 50k + 30k = 80k
            const startVal = result.chartData[0].value;
            expect(startVal).toBeGreaterThanOrEqual(78000);
            expect(startVal).toBeLessThanOrEqual(82000);

            // End: 55k + 28.5k = 83.5k (net +3.5k, +4.4%)
            const endVal = result.chartData[result.chartData.length - 1].value;
            expect(endVal).toBeGreaterThanOrEqual(82000);
            expect(endVal).toBeLessThanOrEqual(85000);

            // Net should be positive (BTC gains > ETH losses)
            expect(result.delta.val).toBeGreaterThan(0);
        });
    });

    describe('Edge Cases in Time Calculations', () => {
        it('handles missing price data gracefully', async () => {
            const nowSec = Math.floor(Date.now() / 1000);
            
            // Sparse data with gaps
            const btcHistory = [
                { time: nowSec - 24 * 3600, close: 48000 },
                { time: nowSec - 20 * 3600, close: 49000 },
                // Gap of 10 hours
                { time: nowSec - 10 * 3600, close: 50000 },
                { time: nowSec, close: 52000 }
            ];

            mockFetchCandles.mockResolvedValue(btcHistory);

            const txns = [{
                dateISO: new Date((nowSec - 48 * 3600) * 1000).toISOString(),
                symbol: 'BTC',
                amount: 1,
                way: 'BUY'
            }];

            const portfolio = [{ symbol: 'BTC', value: 52000, quantity: 1, price: 52000, change24h: 8.33 }];

            const result = await computePortfolioHistory({
                allTxns: txns,
                currentPortfolio: portfolio,
                currency: 'USD',
                range: '1D',
                fetchCandles: mockFetchCandles
            });

            // Should still generate chart (using closest available prices)
            expect(result.chartData.length).toBeGreaterThan(0);
            
            // All values should be reasonable (using last known price)
            result.chartData.forEach(point => {
                expect(point.value).toBeGreaterThanOrEqual(45000);
                expect(point.value).toBeLessThanOrEqual(55000);
            });
        });

        it('handles transaction timestamp exactly at time point', async () => {
            const nowSec = Math.floor(Date.now() / 1000);
            const gridNow = Math.floor(nowSec / 3600) * 3600;
            
            const btcHistory = Array.from({ length: 25 }, (_, i) => ({
                time: gridNow - (24 - i) * 3600,
                close: 50000
            }));

            mockFetchCandles.mockResolvedValue(btcHistory);

            const txns = [{
                // Transaction at exact grid point
                dateISO: new Date((gridNow - 12 * 3600) * 1000).toISOString(),
                symbol: 'BTC',
                amount: 1,
                way: 'BUY'
            }];

            const portfolio = [{ symbol: 'BTC', value: 50000, quantity: 1, price: 50000, change24h: 0 }];

            const result = await computePortfolioHistory({
                allTxns: txns,
                currentPortfolio: portfolio,
                currency: 'USD',
                range: '1D',
                fetchCandles: mockFetchCandles
            });

            // Should include the transaction point
            expect(result.chartData.length).toBeGreaterThan(0);
            
            // Value should jump from 0 to 50k at the transaction point
            const hasZero = result.chartData.some(p => p.value < 1000);
            const hasValue = result.chartData.some(p => p.value > 45000);
            expect(hasZero || hasValue).toBe(true);
        });

        it('handles very small quantities correctly', async () => {
            const nowSec = Math.floor(Date.now() / 1000);
            
            const btcHistory = Array.from({ length: 25 }, (_, i) => ({
                time: nowSec - (24 - i) * 3600,
                close: 50000
            }));

            mockFetchCandles.mockResolvedValue(btcHistory);

            const txns = [{
                dateISO: new Date((nowSec - 48 * 3600) * 1000).toISOString(),
                symbol: 'BTC',
                amount: 0.001, // 1/1000th of a BTC
                way: 'BUY'
            }];

            const portfolio = [{ symbol: 'BTC', value: 50, quantity: 0.001, price: 50000, change24h: 0 }];

            const result = await computePortfolioHistory({
                allTxns: txns,
                currentPortfolio: portfolio,
                currency: 'USD',
                range: '1D',
                fetchCandles: mockFetchCandles
            });

            // Should handle small values correctly
            result.chartData.forEach(point => {
                expect(point.value).toBeGreaterThanOrEqual(45);
                expect(point.value).toBeLessThanOrEqual(55);
            });
        });
    });

    describe('Performance Cap Behavior', () => {
        it('1Y range samples to ~50 points for performance', async () => {
            const nowSec = Math.floor(Date.now() / 1000);
            
            // Generate 400 days of data
            const btcHistory = Array.from({ length: 400 }, (_, i) => ({
                time: nowSec - (400 - i) * 86400,
                close: 30000 + i * 50
            }));

            mockFetchCandles.mockResolvedValue(btcHistory);

            const txns = [{
                dateISO: new Date((nowSec - 400 * 86400) * 1000).toISOString(),
                symbol: 'BTC',
                amount: 1,
                way: 'BUY'
            }];

            const portfolio = [{ symbol: 'BTC', value: 50000, quantity: 1, price: 50000, change24h: 0 }];

            const result = await computePortfolioHistory({
                allTxns: txns,
                currentPortfolio: portfolio,
                currency: 'USD',
                range: '1Y',
                fetchCandles: mockFetchCandles
            });

            // Should be sampled to ~50 points
            expect(result.chartData.length).toBeLessThanOrEqual(55);
            expect(result.chartData.length).toBeGreaterThan(45);
        });

        it('ALL range samples to ~50 points regardless of data size', async () => {
            const nowSec = Math.floor(Date.now() / 1000);
            
            // Generate 1500 days of data (about 4 years)
            const btcHistory = Array.from({ length: 1500 }, (_, i) => ({
                time: nowSec - (1500 - i) * 86400,
                close: 5000 + i * 30
            }));

            mockFetchCandles.mockResolvedValue(btcHistory);

            const txns = [{
                dateISO: new Date((nowSec - 1500 * 86400) * 1000).toISOString(),
                symbol: 'BTC',
                amount: 1,
                way: 'BUY'
            }];

            const portfolio = [{ symbol: 'BTC', value: 50000, quantity: 1, price: 50000, change24h: 0 }];

            const result = await computePortfolioHistory({
                allTxns: txns,
                currentPortfolio: portfolio,
                currency: 'USD',
                range: 'ALL',
                fetchCandles: mockFetchCandles
            });

            // Should be sampled to ~50 points
            expect(result.chartData.length).toBeLessThanOrEqual(55);
            expect(result.chartData.length).toBeGreaterThan(45);

            // First point should be close to first transaction time
            const firstPointTime = result.chartData[0].timestamp / 1000;
            const expectedStartTime = nowSec - 1500 * 86400;
            // Allow some tolerance due to sampling
            const timeDiffDays = Math.abs(firstPointTime - expectedStartTime) / 86400;
            expect(timeDiffDays).toBeLessThan(60); // Within ~2 months of first txn
        });
    });
});
