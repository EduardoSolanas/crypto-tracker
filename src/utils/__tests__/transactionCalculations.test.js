import { computeCoinTransactionStats } from '../transactionCalculations';

describe('transactionCalculations', () => {
    it('computes averages and gains for a basic buy/sell flow', () => {
        const txs = [
            { date_iso: '2024-01-01T00:00:00.000Z', way: 'BUY', amount: 2, quote_amount: 100000 },
            { date_iso: '2024-01-10T00:00:00.000Z', way: 'SELL', amount: 1, quote_amount: 60000 },
        ];

        const stats = computeCoinTransactionStats(txs, 55000, 1);

        expect(stats.avgBuy).toBe(50000);
        expect(stats.avgSell).toBe(60000);
        expect(stats.realizedGains).toBe(10000);
        expect(stats.totalCostBasis).toBe(50000);
        expect(stats.totalGains).toBe(15000); // 10k realized + 5k unrealized
    });

    it('handles sell-then-rebuy cycles without using stale average cost', () => {
        const txs = [
            { date_iso: '2024-01-01T00:00:00.000Z', way: 'BUY', amount: 1, quote_amount: 10000 },
            { date_iso: '2024-01-02T00:00:00.000Z', way: 'SELL', amount: 1, quote_amount: 20000 },
            { date_iso: '2024-01-03T00:00:00.000Z', way: 'BUY', amount: 1, quote_amount: 30000 },
            { date_iso: '2024-01-04T00:00:00.000Z', way: 'SELL', amount: 1, quote_amount: 40000 },
        ];

        const stats = computeCoinTransactionStats(txs, 0, 0);

        // First sale gain: 20k-10k = 10k, second sale gain: 40k-30k = 10k.
        expect(stats.realizedGains).toBe(20000);
        expect(stats.totalCostBasis).toBe(0);
        expect(stats.totalGains).toBe(20000);
    });

    it('supports DEPOSIT/RECEIVE/WITHDRAW/SEND transaction types', () => {
        const txs = [
            { date_iso: '2024-01-01T00:00:00.000Z', way: 'DEPOSIT', amount: 10, quote_amount: 30000 },
            { date_iso: '2024-01-02T00:00:00.000Z', way: 'RECEIVE', amount: 5, quote_amount: 15000 },
            { date_iso: '2024-01-03T00:00:00.000Z', way: 'WITHDRAW', amount: 3, quote_amount: 12000 },
            { date_iso: '2024-01-04T00:00:00.000Z', way: 'SEND', amount: 2, quote_amount: 7000 },
        ];

        const stats = computeCoinTransactionStats(txs, 4000, 10);

        expect(stats.avgBuy).toBe(3000);
        expect(stats.avgSell).toBe(3800);
        expect(stats.count).toBe(4);
        expect(stats.totalCostBasis).toBeGreaterThanOrEqual(29999);
        expect(stats.totalCostBasis).toBeLessThanOrEqual(30001);
    });

    it('does not produce artificial gains when selling more than held', () => {
        const txs = [
            { date_iso: '2024-01-01T00:00:00.000Z', way: 'BUY', amount: 1, quote_amount: 10000 },
            { date_iso: '2024-01-02T00:00:00.000Z', way: 'SELL', amount: 2, quote_amount: 24000 },
        ];

        const stats = computeCoinTransactionStats(txs, 0, 0);

        // Only the matched 1 coin should be considered for realized PnL: 12k proceeds - 10k basis = 2k.
        expect(stats.realizedGains).toBe(2000);
        expect(stats.totalCostBasis).toBe(0);
        expect(stats.totalGains).toBe(2000);
    });

    it('normalizes mixed quote currencies into selected currency when fx rates are provided', () => {
        const txs = [
            {
                date_iso: '2024-01-01T00:00:00.000Z',
                way: 'BUY',
                amount: 1,
                quote_amount: 10000,
                quote_currency: 'USD',
            },
            {
                date_iso: '2024-01-02T00:00:00.000Z',
                way: 'BUY',
                amount: 1,
                quote_amount: 9000,
                quote_currency: 'EUR',
            },
        ];

        const stats = computeCoinTransactionStats(txs, 10000, 2, {
            targetCurrency: 'EUR',
            fxRates: { USD: 0.9, EUR: 1 },
        });

        // First buy 10,000 USD -> 9,000 EUR, second buy 9,000 EUR.
        expect(stats.avgBuy).toBe(9000);
        expect(stats.totalCostBasis).toBe(18000);
        expect(stats.totalGains).toBe(2000);
    });

    it('falls back to original amount when FX rate is missing instead of returning 0', () => {
        // quote_currency differs from target but fxRates is empty (not yet loaded)
        const txs = [
            {
                date_iso: '2024-01-01T00:00:00.000Z',
                way: 'BUY',
                amount: 1,
                quote_amount: 50000,
                quote_currency: 'USD',
            },
        ];

        const stats = computeCoinTransactionStats(txs, 55000, 1, {
            targetCurrency: 'EUR',
            fxRates: {}, // rate not loaded yet
        });

        // Should use 50000 as-is (not 0) so cost basis is preserved
        expect(stats.totalCostBasis).toBe(50000);
        expect(stats.avgBuy).toBe(50000);
    });

    it('avgBuy excludes 0-cost deposits so airdrops do not dilute the average', () => {
        const txs = [
            { date_iso: '2024-01-01T00:00:00.000Z', way: 'BUY', amount: 1, quote_amount: 50000 },
            // Airdrop — no cost recorded
            { date_iso: '2024-01-02T00:00:00.000Z', way: 'RECEIVE', amount: 1, quote_amount: 0 },
        ];
        const stats = computeCoinTransactionStats(txs, 55000, 2);
        // avgBuy should only count the paid unit, not the free one
        expect(stats.avgBuy).toBe(50000);
        // totalCostBasis still covers both units' worth (1 paid unit @ 50k)
        expect(stats.totalCostBasis).toBe(50000);
    });

    it('exposes buyTotalCost for accurate total return percentage', () => {
        const txs = [
            { date_iso: '2024-01-01T00:00:00.000Z', way: 'BUY', amount: 2, quote_amount: 100000 },
            { date_iso: '2024-01-10T00:00:00.000Z', way: 'SELL', amount: 1, quote_amount: 60000 },
        ];

        const stats = computeCoinTransactionStats(txs, 55000, 1);

        // totalGains = 10k realized + 5k unrealized = 15k
        // totalReturnPct should use total invested (100k), not remaining basis (50k)
        // 15k / 100k = 15%, not 30%
        expect(stats.buyTotalCost).toBe(100000);
        expect(stats.totalGains).toBe(15000);
    });
});
