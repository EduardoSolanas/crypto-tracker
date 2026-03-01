import { computeHoldingsFromTxns } from './csv';

const debugLog = (...args) => {
    if (globalThis.__DEV__) {
        console.log(...args);
    }
};

debugLog('[DB][web] using in-memory DB');

const mem = {
    meta: new Map(),
    holdings: {},
    transactions: [],
};

/* ---------------- INIT ---------------- */

export async function initDb() {
    debugLog('[DB][web] initDb (noop)');
}

/* ---------------- META ---------------- */

export async function setMeta(key, value) {
    mem.meta.set(key, String(value));
}

export async function getMeta(key) {
    return mem.meta.get(key) ?? null;
}

/* ---------------- RESET ---------------- */

export async function clearAllData() {
    debugLog('[DB][web] clearAllData');
    mem.holdings = {};
    mem.transactions = [];
    mem.meta.delete('cache');
}

/* ---------------- TRANSACTIONS ---------------- */

export async function insertTransactions(txns) {
    debugLog('[DB][web] insertTransactions:', txns.length);

    let nextId = mem.transactions.reduce((max, t) => Math.max(max, Number(t.id || 0)), 0) + 1;

    const toAdd = txns.map((t) => ({
        id: nextId++,
        date_iso: t.dateISO,
        way: t.way,
        symbol: t.symbol,
        amount: t.amount,
        quote_amount: t.quoteAmount ?? 0,
        quote_currency: t.quoteCurrency ?? null,
    }));
    mem.transactions = [...mem.transactions, ...toAdd];
    await syncAllHoldingsFromTransactions();
}

export async function deleteTransaction(id) {
    mem.transactions = mem.transactions.filter((t) => Number(t.id) !== Number(id));
    await syncAllHoldingsFromTransactions();
}

export async function getTransactionById(id) {
    return mem.transactions.find((t) => Number(t.id) === Number(id)) || null;
}

export async function updateTransaction(id, t) {
    mem.transactions = mem.transactions.map((row) => {
        if (Number(row.id) !== Number(id)) return row;
        return {
            ...row,
            date_iso: t.dateISO,
            way: t.way,
            symbol: t.symbol,
            amount: t.amount,
            quote_amount: t.quoteAmount ?? 0,
            quote_currency: t.quoteCurrency ?? null,
        };
    });
    await syncAllHoldingsFromTransactions();
}

export async function listTransactionsBySymbol(symbol) {
    return mem.transactions
        .filter((t) => t.symbol === symbol)
        .sort((a, b) =>
            a.date_iso < b.date_iso ? 1 : -1
        );
}

export async function getAllTransactions() {
    return [...mem.transactions].sort((a, b) => (a.date_iso < b.date_iso ? -1 : 1));
}

/* ---------------- HOLDINGS ---------------- */

export async function upsertHoldings(holdingsMap) {
    debugLog('[DB][web] upsertHoldings:', holdingsMap);
    mem.holdings = { ...holdingsMap };
}

export async function getHoldingsMap() {
    return { ...mem.holdings };
}

export async function syncHoldingsForSymbol(symbol) {
    await syncAllHoldingsFromTransactions();
    return mem.holdings[symbol] ?? 0;
}

export async function syncAllHoldingsFromTransactions() {
    const normalized = mem.transactions.map((t) => ({
        symbol: t.symbol,
        amount: Number(t.amount || 0),
        way: String(t.way || '').toUpperCase(),
    }));
    mem.holdings = computeHoldingsFromTxns(normalized);
    return { ...mem.holdings };
}
