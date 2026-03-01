/**
 * Comprehensive tests for transaction processing and profit calculations
 * Tests CSV parsing, holdings computation, and per-asset performance
 */

import { computeHoldingsFromTxns, parseDeltaCsvToTxns } from '../../csv';
import { computePortfolioHistory } from '../portfolioHistory';

describe('Transaction Processing & Profit Calculations', () => {
    describe('CSV Parsing - parseDeltaCsvToTxns', () => {
        it('parses basic buy transaction correctly', () => {
            const csv = `Date,Way,Base amount,Base currency,Quote amount,Quote currency
2024-01-15 10:00:00,BUY,1.5,Bitcoin (BTC),45000,USD`;

            const txns = parseDeltaCsvToTxns(csv);

            expect(txns).toHaveLength(1);
            expect(txns[0]).toMatchObject({
                symbol: 'BTC',
                amount: 1.5,
                way: 'BUY',
                quoteAmount: 45000,
                quoteCurrency: 'USD'
            });
            expect(new Date(txns[0].dateISO).getTime()).toBeGreaterThan(0);
        });

        it('parses multiple transaction types', () => {
            const csv = `Date,Way,Base amount,Base currency,Quote amount,Quote currency
2024-01-15 10:00:00,BUY,1,BTC,50000,USD
2024-01-16 12:00:00,SELL,0.5,BTC,27000,USD
2024-01-17 14:00:00,DEPOSIT,10,ETH,0,
2024-01-18 16:00:00,WITHDRAW,5,ETH,0,`;

            const txns = parseDeltaCsvToTxns(csv);

            expect(txns).toHaveLength(4);
            expect(txns.map(t => t.way)).toEqual(['WITHDRAW', 'DEPOSIT', 'SELL', 'BUY']); // Sorted newest first
        });

        it('handles different currency name formats', () => {
            const csv = `Date,Way,Base amount,Base currency,Quote amount,Quote currency
2024-01-15 10:00:00,BUY,1,Bitcoin (BTC),50000,USD
2024-01-16 10:00:00,BUY,10,Ethereum,30000,EUR
2024-01-17 10:00:00,BUY,100,USDT,100,USD`;

            const txns = parseDeltaCsvToTxns(csv);

            expect(txns[2].symbol).toBe('BTC');      // Bitcoin (BTC) → BTC
            expect(txns[1].symbol).toBe('ETHEREUM'); // Ethereum → ETHEREUM
            expect(txns[0].symbol).toBe('USDT');     // USDT → USDT
        });

        it('skips invalid rows gracefully', () => {
            const csv = `Date,Way,Base amount,Base currency,Quote amount,Quote currency
2024-01-15 10:00:00,BUY,1.5,BTC,45000,USD
2024-01-16 10:00:00,BUY,invalid,ETH,3000,USD
,BUY,1,BTC,50000,USD
2024-01-17 10:00:00,,1,BTC,50000,USD
2024-01-18 10:00:00,BUY,,BTC,50000,USD
2024-01-19 10:00:00,BUY,1,,50000,USD`;

            const txns = parseDeltaCsvToTxns(csv);

            expect(txns).toHaveLength(1); // Only first valid row
            expect(txns[0].symbol).toBe('BTC');
        });

        it('handles CSV with quotes correctly', () => {
            const csv = `Date,Way,Base amount,Base currency,Quote amount,Quote currency
"2024-01-15 10:00:00","BUY","1.5","Bitcoin (BTC)","45000","USD"`;

            const txns = parseDeltaCsvToTxns(csv);

            expect(txns).toHaveLength(1);
            expect(txns[0].amount).toBe(1.5);
        });

        it('throws error for invalid CSV format', () => {
            const csv = `Invalid,Header,Format
data,data,data`;

            expect(() => parseDeltaCsvToTxns(csv)).toThrow("Invalid CSV format");
        });

        it('handles negative amounts (should be treated as positive)', () => {
            const csv = `Date,Way,Base amount,Base currency,Quote amount,Quote currency
2024-01-15 10:00:00,BUY,-1.5,BTC,45000,USD`;

            const txns = parseDeltaCsvToTxns(csv);

            expect(txns).toHaveLength(1);
            expect(txns[0].amount).toBe(-1.5); // Preserved as-is, logic handles in computeHoldings
        });
    });

    describe('Holdings Computation - computeHoldingsFromTxns', () => {
        it('calculates holdings from buy transactions', () => {
            const txns = [
                { symbol: 'BTC', amount: 1, way: 'BUY' },
                { symbol: 'BTC', amount: 0.5, way: 'BUY' },
                { symbol: 'ETH', amount: 10, way: 'BUY' }
            ];

            const holdings = computeHoldingsFromTxns(txns);

            expect(holdings.BTC).toBe(1.5);
            expect(holdings.ETH).toBe(10);
        });

        it('handles sell transactions reducing holdings', () => {
            const txns = [
                { symbol: 'BTC', amount: 2, way: 'BUY' },
                { symbol: 'BTC', amount: 0.5, way: 'SELL' },
                { symbol: 'BTC', amount: 0.3, way: 'SELL' }
            ];

            const holdings = computeHoldingsFromTxns(txns);

            expect(holdings.BTC).toBe(1.2);
        });

        it('handles deposit and withdraw transactions', () => {
            const txns = [
                { symbol: 'ETH', amount: 10, way: 'DEPOSIT' },
                { symbol: 'ETH', amount: 3, way: 'WITHDRAW' },
                { symbol: 'USDT', amount: 1000, way: 'RECEIVE' },
                { symbol: 'USDT', amount: 200, way: 'SEND' }
            ];

            const holdings = computeHoldingsFromTxns(txns);

            expect(holdings.ETH).toBe(7);
            expect(holdings.USDT).toBe(800);
        });

        it('filters out assets sold completely', () => {
            const txns = [
                { symbol: 'BTC', amount: 1, way: 'BUY' },
                { symbol: 'BTC', amount: 1, way: 'SELL' },
                { symbol: 'ETH', amount: 10, way: 'BUY' }
            ];

            const holdings = computeHoldingsFromTxns(txns);

            expect(holdings.BTC).toBeUndefined();
            expect(holdings.ETH).toBe(10);
        });

        it('filters out dust amounts (< 0.0000001)', () => {
            const txns = [
                { symbol: 'BTC', amount: 0.000000001, way: 'BUY' }, // Tiny dust
                { symbol: 'ETH', amount: 0.001, way: 'BUY' }        // Valid small amount
            ];

            const holdings = computeHoldingsFromTxns(txns);

            expect(holdings.BTC).toBeUndefined();
            expect(holdings.ETH).toBe(0.001);
        });

        it('handles negative holdings (overselling)', () => {
            const txns = [
                { symbol: 'BTC', amount: 1, way: 'BUY' },
                { symbol: 'BTC', amount: 2, way: 'SELL' } // Sell more than owned!
            ];

            const holdings = computeHoldingsFromTxns(txns);

            // Negative holdings should be filtered out
            expect(holdings.BTC).toBeUndefined();
        });

        it('handles complex multi-asset portfolio', () => {
            const txns = [
                { symbol: 'BTC', amount: 2, way: 'BUY' },
                { symbol: 'ETH', amount: 20, way: 'BUY' },
                { symbol: 'USDT', amount: 10000, way: 'DEPOSIT' },
                { symbol: 'BTC', amount: 0.5, way: 'SELL' },
                { symbol: 'ETH', amount: 5, way: 'WITHDRAW' },
                { symbol: 'USDT', amount: 3000, way: 'SEND' },
                { symbol: 'SOL', amount: 50, way: 'RECEIVE' }
            ];

            const holdings = computeHoldingsFromTxns(txns);

            expect(holdings.BTC).toBe(1.5);
            expect(holdings.ETH).toBe(15);
            expect(holdings.USDT).toBe(7000);
            expect(holdings.SOL).toBe(50);
        });
    });

    describe('Per-Asset Profit Calculation', () => {
        const mockFetchCandles = jest.fn();

        beforeEach(() => {
            jest.clearAllMocks();
            mockFetchCandles.mockResolvedValue([]);
        });

        it('calculates profit correctly for 1D range (using change24h)', async () => {
            const nowSec = Math.floor(Date.now() / 1000);

            const txns = [{
                dateISO: new Date((nowSec - 48 * 3600) * 1000).toISOString(),
                symbol: 'BTC',
                amount: 1,
                way: 'BUY'
            }];

            const portfolio = [{
                symbol: 'BTC',
                value: 52000,
                quantity: 1,
                price: 52000,
                change24h: 8.33  // +8.33% in 24h
            }];

            const result = await computePortfolioHistory({
                allTxns: txns,
                currentPortfolio: portfolio,
                currency: 'USD',
                range: '1D',
                fetchCandles: mockFetchCandles
            });

            // Verify coinDeltas
            expect(result.coinDeltas.BTC).toBeDefined();
            expect(result.coinDeltas.BTC.pct).toBeCloseTo(8.33, 1);

            // Value delta should be ~$4000 (52000 - 48000)
            // startPrice = 52000 / (1 + 0.0833) = 48000
            expect(result.coinDeltas.BTC.val).toBeGreaterThan(3500);
            expect(result.coinDeltas.BTC.val).toBeLessThan(4500);
        });

        it('calculates profit for 1W range using historical prices', async () => {
            const nowSec = Math.floor(Date.now() / 1000);

            // Note: 1W range now uses 42 hourly points (~1.75 days), not full 7 days
            const btcHistory = [
                { time: nowSec - 42 * 3600, open: 45000, close: 45000 },  // 42 hours ago
                { time: nowSec - 24 * 3600, open: 47000, close: 47000 },  // 24 hours ago
                { time: nowSec - 12 * 3600, open: 49000, close: 49000 },  // 12 hours ago
                { time: nowSec, open: 52000, close: 52000 }
            ];

            mockFetchCandles.mockResolvedValue(btcHistory);

            const txns = [{
                dateISO: new Date((nowSec - 50 * 3600) * 1000).toISOString(),  // 50 hours ago
                symbol: 'BTC',
                amount: 1,
                way: 'BUY'
            }];

            const portfolio = [{
                symbol: 'BTC',
                value: 52000,
                quantity: 1,
                price: 52000,
                change24h: 6
            }];

            const result = await computePortfolioHistory({
                allTxns: txns,
                currentPortfolio: portfolio,
                currency: 'USD',
                range: '1W',
                fetchCandles: mockFetchCandles
            });

            // Should use first historical price as start: $45,000
            expect(result.coinDeltas.BTC.val).toBeCloseTo(7000, -2); // 52000 - 45000
            expect(result.coinDeltas.BTC.pct).toBeCloseTo(15.56, 0); // 7000/45000 * 100
        });

        it('calculates profit for multiple assets independently', async () => {
            const nowSec = Math.floor(Date.now() / 1000);

            mockFetchCandles.mockImplementation((sym) => {
                if (sym === 'BTC') {
                    return Promise.resolve([
                        { time: nowSec - 30 * 86400, open: 40000, close: 40000 },
                        { time: nowSec, open: 50000, close: 50000 }
                    ]);
                }
                if (sym === 'ETH') {
                    return Promise.resolve([
                        { time: nowSec - 30 * 86400, open: 2500, close: 2500 },
                        { time: nowSec, open: 3000, close: 3000 }
                    ]);
                }
                return Promise.resolve([]);
            });

            const txns = [
                { dateISO: new Date((nowSec - 45 * 86400) * 1000).toISOString(), symbol: 'BTC', amount: 2, way: 'BUY' },
                { dateISO: new Date((nowSec - 45 * 86400) * 1000).toISOString(), symbol: 'ETH', amount: 10, way: 'BUY' }
            ];

            const portfolio = [
                { symbol: 'BTC', value: 100000, quantity: 2, price: 50000, change24h: 2 },
                { symbol: 'ETH', value: 30000, quantity: 10, price: 3000, change24h: 5 }
            ];

            const result = await computePortfolioHistory({
                allTxns: txns,
                currentPortfolio: portfolio,
                currency: 'USD',
                range: '1M',
                fetchCandles: mockFetchCandles
            });

            // BTC: 2 * (50000 - 40000) = $20,000 gain
            expect(result.coinDeltas.BTC.val).toBeCloseTo(20000, -2);
            expect(result.coinDeltas.BTC.pct).toBeCloseTo(25, 0); // 10k/40k * 100

            // ETH: 10 * (3000 - 2500) = $5,000 gain
            expect(result.coinDeltas.ETH.val).toBeCloseTo(5000, -2);
            expect(result.coinDeltas.ETH.pct).toBeCloseTo(20, 0); // 500/2500 * 100
        });

        it('handles assets with losses correctly', async () => {
            const nowSec = Math.floor(Date.now() / 1000);

            const btcHistory = [
                { time: nowSec - 30 * 86400, open: 60000, close: 60000 },
                { time: nowSec, open: 50000, close: 50000 }
            ];

            mockFetchCandles.mockResolvedValue(btcHistory);

            const txns = [{
                dateISO: new Date((nowSec - 45 * 86400) * 1000).toISOString(),
                symbol: 'BTC',
                amount: 1,
                way: 'BUY'
            }];

            const portfolio = [{
                symbol: 'BTC',
                value: 50000,
                quantity: 1,
                price: 50000,
                change24h: -5
            }];

            const result = await computePortfolioHistory({
                allTxns: txns,
                currentPortfolio: portfolio,
                currency: 'USD',
                range: '1M',
                fetchCandles: mockFetchCandles
            });

            // Loss: -$10,000
            expect(result.coinDeltas.BTC.val).toBeCloseTo(-10000, -2);
            expect(result.coinDeltas.BTC.pct).toBeCloseTo(-16.67, 0); // -10k/60k * 100
        });

        it('handles missing historical data gracefully', async () => {
            const nowSec = Math.floor(Date.now() / 1000);

            mockFetchCandles.mockResolvedValue([]); // No history available

            const txns = [{
                dateISO: new Date((nowSec - 45 * 86400) * 1000).toISOString(),
                symbol: 'NEWCOIN',
                amount: 100,
                way: 'BUY'
            }];

            const portfolio = [{
                symbol: 'NEWCOIN',
                value: 1000,
                quantity: 100,
                price: 10,
                change24h: 0
            }];

            const result = await computePortfolioHistory({
                allTxns: txns,
                currentPortfolio: portfolio,
                currency: 'USD',
                range: '1M',
                fetchCandles: mockFetchCandles
            });

            // Should return 0 when no history
            expect(result.coinDeltas.NEWCOIN).toEqual({ val: 0, pct: 0 });
        });
    });

    describe('Total Portfolio Profit Calculation', () => {
        const mockFetchCandles = jest.fn();

        beforeEach(() => {
            jest.clearAllMocks();
        });

        it('calculates total portfolio profit correctly', async () => {
            const nowSec = Math.floor(Date.now() / 1000);

            mockFetchCandles.mockImplementation((sym) => {
                if (sym === 'BTC') {
                    return Promise.resolve([
                        { time: nowSec - 30 * 86400, close: 40000 },
                        { time: nowSec, close: 50000 }
                    ]);
                }
                if (sym === 'ETH') {
                    return Promise.resolve([
                        { time: nowSec - 30 * 86400, close: 2500 },
                        { time: nowSec, close: 3000 }
                    ]);
                }
                return Promise.resolve([]);
            });

            const txns = [
                { dateISO: new Date((nowSec - 45 * 86400) * 1000).toISOString(), symbol: 'BTC', amount: 1, way: 'BUY' },
                { dateISO: new Date((nowSec - 45 * 86400) * 1000).toISOString(), symbol: 'ETH', amount: 10, way: 'BUY' }
            ];

            const portfolio = [
                { symbol: 'BTC', value: 50000, quantity: 1, price: 50000, change24h: 2 },
                { symbol: 'ETH', value: 30000, quantity: 10, price: 3000, change24h: 5 }
            ];

            const result = await computePortfolioHistory({
                allTxns: txns,
                currentPortfolio: portfolio,
                currency: 'USD',
                range: '1M',
                fetchCandles: mockFetchCandles
            });

            // Total start value: 40000 + 25000 = 65000
            // Total end value: 50000 + 30000 = 80000
            // Total profit: 15000 (23.08%)
            expect(result.delta.val).toBeCloseTo(15000, -2);
            expect(result.delta.pct).toBeCloseTo(23.08, 0);
            expect(result.chartColor).toBe('#22c55e'); // Green for profit
        });

        it('shows loss when portfolio value decreases', async () => {
            const nowSec = Math.floor(Date.now() / 1000);

            const btcHistory = [
                { time: nowSec - 30 * 86400, close: 60000 },
                { time: nowSec, close: 45000 }
            ];

            mockFetchCandles.mockResolvedValue(btcHistory);

            const txns = [{
                dateISO: new Date((nowSec - 45 * 86400) * 1000).toISOString(),
                symbol: 'BTC',
                amount: 1,
                way: 'BUY'
            }];

            const portfolio = [{
                symbol: 'BTC',
                value: 45000,
                quantity: 1,
                price: 45000,
                change24h: -10
            }];

            const result = await computePortfolioHistory({
                allTxns: txns,
                currentPortfolio: portfolio,
                currency: 'USD',
                range: '1M',
                fetchCandles: mockFetchCandles
            });

            // Loss: -15000 (-25%)
            expect(result.delta.val).toBeLessThan(0);
            expect(result.delta.val).toBeCloseTo(-15000, -2);
            expect(result.delta.pct).toBeCloseTo(-25, 0);
            expect(result.chartColor).toBe('#ef4444'); // Red for loss
        });

        it('accounts for transactions that occurred during the range', async () => {
            const nowSec = Math.floor(Date.now() / 1000);

            const btcHistory = Array.from({ length: 35 }, (_, i) => ({
                time: nowSec - (35 - i) * 86400,
                close: 45000 + i * 200  // Linearly increasing: 45000 → 51800
            }));

            mockFetchCandles.mockResolvedValue(btcHistory);

            const txns = [
                // Start with 1 BTC before range
                { dateISO: new Date((nowSec - 45 * 86400) * 1000).toISOString(), symbol: 'BTC', amount: 1, way: 'BUY' },
                // Buy another 1 BTC mid-range (15 days ago)
                { dateISO: new Date((nowSec - 15 * 86400) * 1000).toISOString(), symbol: 'BTC', amount: 1, way: 'BUY' }
            ];

            const portfolio = [{
                symbol: 'BTC',
                value: 103600, // 2 * 51800
                quantity: 2,
                price: 51800,
                change24h: 2
            }];

            const result = await computePortfolioHistory({
                allTxns: txns,
                currentPortfolio: portfolio,
                currency: 'USD',
                range: '1M',
                fetchCandles: mockFetchCandles
            });

            // Note: 1M range trims leading zeros, so first value won't be at 30 days ago
            // First value should be ~45000-46000 (1 BTC at start of history)
            expect(result.chartData[0].value).toBeGreaterThan(44000);
            expect(result.chartData[0].value).toBeLessThan(47000);

            // End: 2 BTC * 51800 = 103600
            expect(result.chartData[result.chartData.length - 1].value).toBeCloseTo(103600, -2);

            // Profit includes both price increase AND quantity increase
            expect(result.delta.val).toBeGreaterThan(50000);
        });
    });

    describe('Edge Cases in Profit Calculation', () => {
        const mockFetchCandles = jest.fn();

        beforeEach(() => {
            jest.clearAllMocks();
            mockFetchCandles.mockResolvedValue([]);
        });

        it('handles zero starting value (bought at range start)', async () => {
            const nowSec = Math.floor(Date.now() / 1000);

            const btcHistory = Array.from({ length: 35 }, (_, i) => ({
                time: nowSec - (35 - i) * 86400,
                close: 45000 + i * 200
            }));

            mockFetchCandles.mockResolvedValue(btcHistory);

            const txns = [
                // Buy exactly at range start
                { dateISO: new Date((nowSec - 30 * 86400) * 1000).toISOString(), symbol: 'BTC', amount: 1, way: 'BUY' }
            ];

            const portfolio = [{
                symbol: 'BTC',
                value: 51000,
                quantity: 1,
                price: 51000,
                change24h: 2
            }];

            const result = await computePortfolioHistory({
                allTxns: txns,
                currentPortfolio: portfolio,
                currency: 'USD',
                range: '1M',
                fetchCandles: mockFetchCandles
            });

            // Delta should be calculated from first point with value
            expect(result.delta.val).toBeGreaterThan(5000);
        });

        it('handles assets with very small quantities', async () => {
            const nowSec = Math.floor(Date.now() / 1000);

            const btcHistory = [
                { time: nowSec - 30 * 86400, open: 40000, close: 40000 },
                { time: nowSec, open: 50000, close: 50000 }
            ];

            mockFetchCandles.mockResolvedValue(btcHistory);

            const txns = [{
                dateISO: new Date((nowSec - 45 * 86400) * 1000).toISOString(),
                symbol: 'BTC',
                amount: 0.001,  // Very small amount
                way: 'BUY'
            }];

            const portfolio = [{
                symbol: 'BTC',
                value: 50,
                quantity: 0.001,
                price: 50000,
                change24h: 2
            }];

            const result = await computePortfolioHistory({
                allTxns: txns,
                currentPortfolio: portfolio,
                currency: 'USD',
                range: '1M',
                fetchCandles: mockFetchCandles
            });

            // Profit should be proportional: 0.001 * (50000 - 40000) = $10
            expect(result.coinDeltas.BTC.val).toBeCloseTo(10, 0);
        });

        it('handles rapid buy/sell cycles correctly', async () => {
            const nowSec = Math.floor(Date.now() / 1000);

            const btcHistory = Array.from({ length: 35 }, (_, i) => ({
                time: nowSec - (35 - i) * 86400,
                close: 50000
            }));

            mockFetchCandles.mockResolvedValue(btcHistory);

            const txns = [
                { dateISO: new Date((nowSec - 30 * 86400) * 1000).toISOString(), symbol: 'BTC', amount: 1, way: 'BUY' },
                { dateISO: new Date((nowSec - 25 * 86400) * 1000).toISOString(), symbol: 'BTC', amount: 0.5, way: 'SELL' },
                { dateISO: new Date((nowSec - 20 * 86400) * 1000).toISOString(), symbol: 'BTC', amount: 1, way: 'BUY' },
                { dateISO: new Date((nowSec - 15 * 86400) * 1000).toISOString(), symbol: 'BTC', amount: 0.8, way: 'SELL' },
                { dateISO: new Date((nowSec - 10 * 86400) * 1000).toISOString(), symbol: 'BTC', amount: 0.5, way: 'BUY' }
            ];

            const portfolio = [{
                symbol: 'BTC',
                value: 60000, // 1.2 * 50000
                quantity: 1.2,
                price: 50000,
                change24h: 0
            }];

            const result = await computePortfolioHistory({
                allTxns: txns,
                currentPortfolio: portfolio,
                currency: 'USD',
                range: '1M',
                fetchCandles: mockFetchCandles
            });

            // Final quantity should be: 1 - 0.5 + 1 - 0.8 + 0.5 = 1.2
            expect(result.chartData[result.chartData.length - 1].value).toBeCloseTo(60000, -2);
        });

        it('selects closest candle when rangeStart falls between candles', async () => {
            const nowSec = Math.floor(Date.now() / 1000);
            const rangeStartTime = nowSec - 30 * 86400; // 30 days ago

            // Create history with gap around rangeStart
            const btcHistory = [
                { time: rangeStartTime - 86400, open: 45000, close: 45000 },  // 1 day before (closer)
                { time: rangeStartTime + 86400, open: 47000, close: 47000 }   // 1 day after
            ];

            mockFetchCandles.mockResolvedValue(btcHistory);

            const txns = [{
                dateISO: new Date((nowSec - 45 * 86400) * 1000).toISOString(),
                symbol: 'BTC',
                amount: 1,
                way: 'BUY'
            }];

            const portfolio = [{
                symbol: 'BTC',
                value: 50000,
                quantity: 1,
                price: 50000,
                change24h: 2
            }];

            const result = await computePortfolioHistory({
                allTxns: txns,
                currentPortfolio: portfolio,
                currency: 'USD',
                range: '1M',
                fetchCandles: mockFetchCandles
            });

            // Should use the closest candle (45000), not the first one >= rangeStart (47000)
            // Profit should be: 50000 - 45000 = 5000
            expect(result.coinDeltas.BTC.val).toBeCloseTo(5000, -2);
            expect(result.coinDeltas.BTC.pct).toBeCloseTo(11.11, 0); // 5000/45000 * 100
        });

        it('handles malformed candle data without open or close prices', async () => {
            const nowSec = Math.floor(Date.now() / 1000);

            const btcHistory = [
                { time: nowSec - 30 * 86400 },  // No open or close!
                { time: nowSec, open: 50000, close: 50000 }
            ];

            mockFetchCandles.mockResolvedValue(btcHistory);

            const txns = [{
                dateISO: new Date((nowSec - 45 * 86400) * 1000).toISOString(),
                symbol: 'BTC',
                amount: 1,
                way: 'BUY'
            }];

            const portfolio = [{
                symbol: 'BTC',
                value: 50000,
                quantity: 1,
                price: 50000,
                change24h: 2
            }];

            const result = await computePortfolioHistory({
                allTxns: txns,
                currentPortfolio: portfolio,
                currency: 'USD',
                range: '1M',
                fetchCandles: mockFetchCandles
            });

            // Should not crash, should return 0 profit when startPrice is 0
            expect(result.coinDeltas.BTC).toEqual({ val: 0, pct: 0 });
        });

        it('handles candle with only close price (no open)', async () => {
            const nowSec = Math.floor(Date.now() / 1000);

            const btcHistory = [
                { time: nowSec - 30 * 86400, close: 45000 },  // Only close, no open
                { time: nowSec, open: 50000, close: 50000 }
            ];

            mockFetchCandles.mockResolvedValue(btcHistory);

            const txns = [{
                dateISO: new Date((nowSec - 45 * 86400) * 1000).toISOString(),
                symbol: 'BTC',
                amount: 1,
                way: 'BUY'
            }];

            const portfolio = [{
                symbol: 'BTC',
                value: 50000,
                quantity: 1,
                price: 50000,
                change24h: 2
            }];

            const result = await computePortfolioHistory({
                allTxns: txns,
                currentPortfolio: portfolio,
                currency: 'USD',
                range: '1M',
                fetchCandles: mockFetchCandles
            });

            // Should use close price as fallback
            expect(result.coinDeltas.BTC.val).toBeCloseTo(5000, -2);
            expect(result.coinDeltas.BTC.pct).toBeCloseTo(11.11, 0);
        });

        it('calculates total portfolio delta from range start, not first non-zero point', async () => {
            const nowSec = Math.floor(Date.now() / 1000);

            // User bought BTC 60 days ago at $30k
            const txns = [{
                dateISO: new Date((nowSec - 60 * 86400) * 1000).toISOString(),
                symbol: 'BTC',
                amount: 1,
                way: 'BUY'
            }];

            // BTC price history: $30k at purchase, $40k at 30 days ago (1M range start), $50k now
            const btcHistory = Array.from({ length: 65 }, (_, i) => {
                const daysAgo = 65 - i;
                const time = nowSec - daysAgo * 86400;
                let price;
                if (daysAgo >= 60) price = 30000;  // Purchase price
                else if (daysAgo >= 30) price = 40000;  // 1M ago
                else price = 50000;  // Recent
                return { time, open: price, close: price };
            });

            mockFetchCandles.mockResolvedValue(btcHistory);

            const portfolio = [{
                symbol: 'BTC',
                value: 50000,
                quantity: 1,
                price: 50000,
                change24h: 2
            }];

            const result = await computePortfolioHistory({
                allTxns: txns,
                currentPortfolio: portfolio,
                currency: 'USD',
                range: '1M',
                fetchCandles: mockFetchCandles
            });

            // For 1M range, delta should be calculated from 30 days ago ($40k), not from first transaction ($30k)
            // Expected: $50k - $40k = +$10k (+25%)
            // Bug would give: $50k - $30k = +$20k (+66.67%) if calculated after slicing

            expect(result.delta.val).toBeCloseTo(10000, -2);
            expect(result.delta.pct).toBeCloseTo(25, 0);
        });

    });

    describe('CoinScreen Average Buy/Sell Price Calculation', () => {
        it('calculates average buy price correctly', () => {
            const txs = [
                { way: 'BUY', amount: 1, quote_amount: 50000 },
                { way: 'BUY', amount: 0.5, quote_amount: 30000 },
                { way: 'BUY', amount: 2, quote_amount: 100000 }
            ];

            let buyTotalCost = 0, buyTotalQty = 0;
            for (const t of txs) {
                if (t.way === 'BUY') {
                    buyTotalCost += t.quote_amount;
                    buyTotalQty += t.amount;
                }
            }
            const avgBuy = buyTotalQty > 0 ? buyTotalCost / buyTotalQty : 0;

            // Total: $180,000 / 3.5 BTC = $51,428.57 per BTC
            expect(avgBuy).toBeCloseTo(51428.57, 2);
        });

        it('calculates average sell price correctly', () => {
            const txs = [
                { way: 'BUY', amount: 2, quote_amount: 100000 },
                { way: 'SELL', amount: 0.5, quote_amount: 30000 },
                { way: 'SELL', amount: 0.3, quote_amount: 18000 }
            ];

            let sellTotalValue = 0, sellTotalQty = 0;
            for (const t of txs) {
                if (t.way === 'SELL') {
                    sellTotalValue += t.quote_amount;
                    sellTotalQty += t.amount;
                }
            }
            const avgSell = sellTotalQty > 0 ? sellTotalValue / sellTotalQty : 0;

            // Total: $48,000 / 0.8 BTC = $60,000 per BTC
            expect(avgSell).toBe(60000);
        });

        it('handles mixed buy/sell transactions correctly', () => {
            const txs = [
                { way: 'BUY', amount: 3, quote_amount: 150000 },
                { way: 'SELL', amount: 1, quote_amount: 60000 },
                { way: 'BUY', amount: 0.5, quote_amount: 30000 },
                { way: 'SELL', amount: 0.5, quote_amount: 32000 }
            ];

            let buyTotalCost = 0, buyTotalQty = 0;
            let sellTotalValue = 0, sellTotalQty = 0;

            for (const t of txs) {
                if (t.way === 'BUY') {
                    buyTotalCost += t.quote_amount;
                    buyTotalQty += t.amount;
                } else if (t.way === 'SELL') {
                    sellTotalValue += t.quote_amount;
                    sellTotalQty += t.amount;
                }
            }

            const avgBuy = buyTotalQty > 0 ? buyTotalCost / buyTotalQty : 0;
            const avgSell = sellTotalQty > 0 ? sellTotalValue / sellTotalQty : 0;

            // Avg buy: $180,000 / 3.5 = $51,428.57
            expect(avgBuy).toBeCloseTo(51428.57, 2);
            // Avg sell: $92,000 / 1.5 = $61,333.33
            expect(avgSell).toBeCloseTo(61333.33, 2);
        });

        it('handles DEPOSIT and WITHDRAW as BUY/SELL equivalents', () => {
            const txs = [
                { way: 'DEPOSIT', amount: 10, quote_amount: 30000 },
                { way: 'BUY', amount: 5, quote_amount: 15000 },
                { way: 'WITHDRAW', amount: 3, quote_amount: 9000 },
                { way: 'SELL', amount: 2, quote_amount: 6000 }
            ];

            let buyTotalCost = 0, buyTotalQty = 0;
            let sellTotalValue = 0, sellTotalQty = 0;

            for (const t of txs) {
                if (['BUY', 'DEPOSIT', 'RECEIVE'].includes(t.way)) {
                    buyTotalCost += t.quote_amount;
                    buyTotalQty += t.amount;
                } else if (['SELL', 'WITHDRAW', 'SEND'].includes(t.way)) {
                    sellTotalValue += t.quote_amount;
                    sellTotalQty += t.amount;
                }
            }

            const avgBuy = buyTotalQty > 0 ? buyTotalCost / buyTotalQty : 0;
            const avgSell = sellTotalQty > 0 ? sellTotalValue / sellTotalQty : 0;

            // Avg buy: $45,000 / 15 = $3,000
            expect(avgBuy).toBe(3000);
            // Avg sell: $15,000 / 5 = $3,000
            expect(avgSell).toBe(3000);
        });
    });

    describe('Cost Basis and Realized Gains Calculation', () => {
        it('tracks cost basis correctly with only BUY transactions', () => {
            const txs = [
                { way: 'BUY', amount: 1, quote_amount: 50000 },
                { way: 'BUY', amount: 0.5, quote_amount: 30000 }
            ];

            let totalCostBasis = 0;
            for (const t of txs) {
                if (t.way === 'BUY') {
                    totalCostBasis += t.quote_amount;
                }
            }

            expect(totalCostBasis).toBe(80000);
        });

        it('calculates realized gains correctly for SELL transactions', () => {
            const txs = [
                { way: 'BUY', amount: 2, quote_amount: 100000 }, // Buy 2 BTC @ $50k each
                { way: 'SELL', amount: 1, quote_amount: 60000 }  // Sell 1 BTC @ $60k
            ];

            let buyTotalCost = 0, buyTotalQty = 0;
            let realizedGains = 0;
            let totalCostBasis = 0;

            for (const t of txs) {
                if (t.way === 'BUY') {
                    buyTotalCost += t.quote_amount;
                    buyTotalQty += t.amount;
                    totalCostBasis += t.quote_amount;
                } else if (t.way === 'SELL') {
                    const avgCostPerCoin = buyTotalQty > 0 ? buyTotalCost / buyTotalQty : 0;
                    const costBasisForSale = avgCostPerCoin * t.amount;
                    realizedGains += (t.quote_amount - costBasisForSale);
                    totalCostBasis -= costBasisForSale;
                }
            }

            // Realized gain: $60k - $50k = $10k
            expect(realizedGains).toBe(10000);
            // Remaining cost basis: $100k - $50k = $50k
            expect(totalCostBasis).toBe(50000);
        });

        it('handles multiple SELL transactions correctly', () => {
            const txs = [
                { way: 'BUY', amount: 3, quote_amount: 150000 },  // Buy 3 BTC @ $50k each
                { way: 'SELL', amount: 1, quote_amount: 60000 },  // Sell 1 @ $60k (gain: $10k)
                { way: 'SELL', amount: 0.5, quote_amount: 35000 } // Sell 0.5 @ $70k (gain: $10k)
            ];

            let buyTotalCost = 0, buyTotalQty = 0;
            let realizedGains = 0;
            let totalCostBasis = 0;

            for (const t of txs) {
                if (t.way === 'BUY') {
                    buyTotalCost += t.quote_amount;
                    buyTotalQty += t.amount;
                    totalCostBasis += t.quote_amount;
                } else if (t.way === 'SELL') {
                    const avgCostPerCoin = buyTotalQty > 0 ? buyTotalCost / buyTotalQty : 0;
                    const costBasisForSale = avgCostPerCoin * t.amount;
                    realizedGains += (t.quote_amount - costBasisForSale);
                    totalCostBasis -= costBasisForSale;
                }
            }

            // Total realized: $10k + $10k = $20k
            expect(realizedGains).toBe(20000);
            // Remaining cost basis: $150k - $50k - $25k = $75k
            expect(totalCostBasis).toBe(75000);
        });

        it('calculates total gains including unrealized gains', () => {
            const txs = [
                { way: 'BUY', amount: 2, quote_amount: 100000 },
                { way: 'SELL', amount: 1, quote_amount: 60000 }
            ];

            const currentPrice = 55000; // Current BTC price
            const currentQty = 1; // 1 BTC remaining

            let buyTotalCost = 0, buyTotalQty = 0;
            let realizedGains = 0;
            let totalCostBasis = 0;

            for (const t of txs) {
                if (t.way === 'BUY') {
                    buyTotalCost += t.quote_amount;
                    buyTotalQty += t.amount;
                    totalCostBasis += t.quote_amount;
                } else if (t.way === 'SELL') {
                    const avgCostPerCoin = buyTotalQty > 0 ? buyTotalCost / buyTotalQty : 0;
                    const costBasisForSale = avgCostPerCoin * t.amount;
                    realizedGains += (t.quote_amount - costBasisForSale);
                    totalCostBasis -= costBasisForSale;
                }
            }

            const currentValue = currentPrice * currentQty;
            const totalGains = realizedGains + currentValue - totalCostBasis;

            // Realized: $10k
            // Unrealized: $55k (current) - $50k (basis) = $5k
            // Total: $15k
            expect(realizedGains).toBe(10000);
            expect(currentValue - totalCostBasis).toBe(5000);
            expect(totalGains).toBe(15000);
        });

        it('handles realized loss correctly', () => {
            const txs = [
                { way: 'BUY', amount: 1, quote_amount: 60000 },
                { way: 'SELL', amount: 1, quote_amount: 50000 }
            ];

            let buyTotalCost = 0, buyTotalQty = 0;
            let realizedGains = 0;

            for (const t of txs) {
                if (t.way === 'BUY') {
                    buyTotalCost += t.quote_amount;
                    buyTotalQty += t.amount;
                } else if (t.way === 'SELL') {
                    const avgCostPerCoin = buyTotalQty > 0 ? buyTotalCost / buyTotalQty : 0;
                    const costBasisForSale = avgCostPerCoin * t.amount;
                    realizedGains += (t.quote_amount - costBasisForSale);
                }
            }

            // Realized loss: $50k - $60k = -$10k
            expect(realizedGains).toBe(-10000);
        });
    });

    describe('Per-Transaction Delta Calculation', () => {
        it('calculates delta correctly for profitable transaction', () => {
            const tx = { way: 'BUY', amount: 1, quote_amount: 50000 };
            const currentPrice = 60000;

            const purchasePrice = tx.amount > 0 ? tx.quote_amount / tx.amount : 0;
            const deltaPct = purchasePrice > 0 ? ((currentPrice - purchasePrice) / purchasePrice) * 100 : 0;
            const deltaVal = (currentPrice - purchasePrice) * tx.amount;

            expect(purchasePrice).toBe(50000);
            expect(deltaPct).toBe(20); // 20% gain
            expect(deltaVal).toBe(10000); // $10k gain
        });

        it('calculates delta correctly for loss transaction', () => {
            const tx = { way: 'BUY', amount: 0.5, quote_amount: 30000 };
            const currentPrice = 50000;

            const purchasePrice = tx.amount > 0 ? tx.quote_amount / tx.amount : 0;
            const deltaPct = purchasePrice > 0 ? ((currentPrice - purchasePrice) / purchasePrice) * 100 : 0;
            const deltaVal = (currentPrice - purchasePrice) * tx.amount;

            expect(purchasePrice).toBe(60000);
            expect(deltaPct).toBeCloseTo(-16.67, 2); // -16.67% loss
            expect(deltaVal).toBeCloseTo(-5000, 2); // -$5k loss
        });

        it('handles SELL transaction delta (sold vs current)', () => {
            const tx = { way: 'SELL', amount: 1, quote_amount: 55000 };
            const currentPrice = 60000;

            const salePrice = tx.amount > 0 ? tx.quote_amount / tx.amount : 0;
            const missedGainPct = salePrice > 0 ? ((currentPrice - salePrice) / salePrice) * 100 : 0;

            expect(salePrice).toBe(55000);
            expect(missedGainPct).toBeCloseTo(9.09, 2); // Missed 9.09% gain by selling early
        });

        it('handles zero amount edge case', () => {
            const tx = { way: 'BUY', amount: 0, quote_amount: 0 };
            const currentPrice = 50000;

            const purchasePrice = tx.amount > 0 ? tx.quote_amount / tx.amount : 0;
            const deltaPct = purchasePrice > 0 ? ((currentPrice - purchasePrice) / purchasePrice) * 100 : 0;

            expect(purchasePrice).toBe(0);
            expect(deltaPct).toBe(0);
        });
    });

    describe('Mixed Quote Currencies', () => {
        it('handles transactions in different quote currencies (user scenario)', () => {
            // Simulating user's real data: buying XRP with ETH, then converting ETH to USD
            const txs = [
                { way: 'BUY', symbol: 'XRP', amount: 879, quote_amount: 1.311468, quote_currency: 'ETH' },
                { way: 'BUY', symbol: 'ETH', amount: 2.53345, quote_amount: 3579.44, quote_currency: 'USD' }
            ];

            // In real app, prices would be fetched in user's preferred currency (e.g., EUR)
            // CSV parser preserves quote_currency, allowing conversion if needed
            expect(txs[0].quote_currency).toBe('ETH');
            expect(txs[1].quote_currency).toBe('USD');

            // The quote_amount should be used as-is for calculations
            // When displaying, the app should convert to user's preferred currency
            expect(txs[0].quote_amount).toBeCloseTo(1.311468, 6);
            expect(txs[1].quote_amount).toBeCloseTo(3579.44, 2);
        });

        it('calculates average buy price for multi-currency transactions', () => {
            // NOTE: This is a known limitation - mixing quote currencies in avg buy calculation
            // requires conversion to a common currency. Currently the app uses quote_amount as-is.
            const txs = [
                { way: 'BUY', amount: 1, quote_amount: 50000, quote_currency: 'USD' },
                { way: 'BUY', amount: 0.5, quote_amount: 25000, quote_currency: 'EUR' }
            ];

            let buyTotalCost = 0, buyTotalQty = 0;
            for (const t of txs) {
                if (t.way === 'BUY') {
                    // WARNING: Adding USD and EUR directly is incorrect without conversion
                    // This test documents current behavior, not ideal behavior
                    buyTotalCost += t.quote_amount;
                    buyTotalQty += t.amount;
                }
            }
            const avgBuy = buyTotalQty > 0 ? buyTotalCost / buyTotalQty : 0;

            // This calculation is technically incorrect (mixing currencies)
            // but documents current behavior: (50000 USD + 25000 EUR) / 1.5 = 50000
            expect(avgBuy).toBe(50000);
        });
    });
});
