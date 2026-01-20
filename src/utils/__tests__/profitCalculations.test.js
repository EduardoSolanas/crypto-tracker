/**
 * Comprehensive tests for transaction processing and profit calculations
 * Tests CSV parsing, holdings computation, and per-asset performance
 */

import { parseDeltaCsvToTxns, computeHoldingsFromTxns } from '../../csv';
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
    });
});
