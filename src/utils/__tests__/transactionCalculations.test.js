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
});
