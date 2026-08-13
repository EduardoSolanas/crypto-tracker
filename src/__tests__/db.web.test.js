import {
    clearAllData,
    deleteTransaction,
    getAllTransactions,
    getHoldingsMap,
    getMeta,
    getTransactionById,
    insertTransactions,
    replaceAllTransactions,
    loadCache,
    saveCache,
    setMeta,
    syncAllHoldingsFromTransactions,
    updateTransaction,
} from '../db.web';

describe('db.web holdings sync invariants', () => {
    beforeEach(async () => {
        await clearAllData();
    });

    it('keeps holdings in sync after insert', async () => {
        await insertTransactions([
            { dateISO: '2024-01-01T00:00:00.000Z', way: 'BUY', symbol: 'BTC', amount: 2, quoteAmount: 60000, quoteCurrency: 'EUR' },
            { dateISO: '2024-01-02T00:00:00.000Z', way: 'SELL', symbol: 'BTC', amount: 0.5, quoteAmount: 18000, quoteCurrency: 'EUR' },
        ]);

        const holdings = await getHoldingsMap();
        expect(holdings.BTC).toBe(1.5);
    });

    it('keeps holdings in sync when updating symbol on an existing transaction', async () => {
        await insertTransactions([
            { dateISO: '2024-01-01T00:00:00.000Z', way: 'BUY', symbol: 'BTC', amount: 1, quoteAmount: 30000, quoteCurrency: 'EUR' },
        ]);

        const rows = await getAllTransactions();
        const txId = rows[0].id;
        await updateTransaction(txId, {
            dateISO: rows[0].date_iso,
            way: 'BUY',
            symbol: 'ETH',
            amount: 1,
            quoteAmount: 3000,
            quoteCurrency: 'EUR',
        });

        const holdings = await getHoldingsMap();
        expect(holdings.BTC).toBeUndefined();
        expect(holdings.ETH).toBe(1);
    });

    it('keeps holdings in sync after delete', async () => {
        await insertTransactions([
            { dateISO: '2024-01-01T00:00:00.000Z', way: 'BUY', symbol: 'SOL', amount: 10, quoteAmount: 1000, quoteCurrency: 'EUR' },
        ]);

        const tx = await getTransactionById(1);
        await deleteTransaction(tx.id);
        await syncAllHoldingsFromTransactions();

        const holdings = await getHoldingsMap();
        expect(holdings.SOL).toBeUndefined();
    });

    it('replaces transactions and derived holdings together', async () => {
        await insertTransactions([
            { dateISO: '2024-01-01T00:00:00.000Z', way: 'BUY', symbol: 'BTC', amount: 1 },
        ]);

        await replaceAllTransactions([
            { dateISO: '2024-01-02T00:00:00.000Z', way: 'DEPOSIT', symbol: 'ETH', amount: 2 },
        ]);

        const transactions = await getAllTransactions();
        expect(transactions).toHaveLength(1);
        expect(transactions[0]).toMatchObject({ symbol: 'ETH', amount: 2 });
        expect(await getHoldingsMap()).toEqual({ ETH: 2 });
    });
});

describe('db.web market cache', () => {
    beforeEach(async () => {
        await clearAllData();
    });

    it('round-trips the cache using the same API as the native database', async () => {
        const portfolio = [{ symbol: 'BTC', value: 100 }];
        const chartData = [{ timestamp: 1, value: 100 }];
        const delta = { val: 5, pct: 5 };

        await saveCache(portfolio, chartData, delta, '1D', 'EUR');

        expect(await loadCache('EUR')).toEqual(expect.objectContaining({
            portfolio,
            chartData,
            delta,
            range: '1D',
            currency: 'EUR',
            timestamp: expect.any(Number),
        }));
    });

    it('does not return a cache created for a different currency', async () => {
        await saveCache([{ symbol: 'BTC', value: 100 }], [], { val: 0, pct: 0 }, '1D', 'EUR');

        expect(await loadCache('USD')).toBeNull();
    });

    it('invalidates cached prices when transactions change', async () => {
        await saveCache([{ symbol: 'BTC', value: 100 }], [], { val: 0, pct: 0 }, '1D', 'EUR');

        await insertTransactions([
            { dateISO: '2024-01-01T00:00:00.000Z', way: 'BUY', symbol: 'BTC', amount: 1, quoteAmount: 100, quoteCurrency: 'EUR' },
        ]);

        expect(await loadCache('EUR')).toBeNull();
    });

    it('clears every cached value without clearing unrelated metadata', async () => {
        await setMeta('currency', 'USD');
        await saveCache([], [], { val: 0, pct: 0 }, '1D', 'USD');

        await clearAllData();

        expect(await loadCache()).toBeNull();
        expect(await getMeta('currency')).toBe('USD');
    });
});
