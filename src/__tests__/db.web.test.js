import {
    clearAllData,
    deleteTransaction,
    getAllTransactions,
    getHoldingsMap,
    getTransactionById,
    insertTransactions,
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
});
