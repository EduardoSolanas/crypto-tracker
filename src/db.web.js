// src/db.web.js
console.log('[DB][web] using in-memory DB');

const mem = {
    meta: new Map(),
    holdings: {},
    transactions: [],
};

/* ---------------- INIT ---------------- */

export async function initDb() {
    console.log('[DB][web] initDb (noop)');
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
    console.log('[DB][web] clearAllData');
    mem.holdings = {};
    mem.transactions = [];
}

/* ---------------- TRANSACTIONS ---------------- */

export async function insertTransactions(txns) {
    console.log('[DB][web] insertTransactions:', txns.length);

    let nextId = mem.transactions.length
        ? mem.transactions[0].id + 1
        : 1;

    mem.transactions = txns.map((t) => ({
        id: nextId++,
        date_iso: t.dateISO,
        way: t.way,
        symbol: t.symbol,
        amount: t.amount,
        quote_amount: t.quoteAmount ?? 0,
        quote_currency: t.quoteCurrency ?? null,
    }));
}

export async function listTransactionsBySymbol(symbol) {
    return mem.transactions
        .filter((t) => t.symbol === symbol)
        .sort((a, b) =>
            a.date_iso < b.date_iso ? 1 : -1
        );
}

export async function getAllTransactions() {
    return mem.transactions.sort((a, b) => (a.date_iso < b.date_iso ? -1 : 1));
}

/* ---------------- HOLDINGS ---------------- */

export async function upsertHoldings(holdingsMap) {
    console.log('[DB][web] upsertHoldings:', holdingsMap);
    mem.holdings = { ...holdingsMap };
}

export async function getHoldingsMap() {
    return { ...mem.holdings };
}
