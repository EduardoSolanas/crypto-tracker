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
    await clearCache();
}

const CACHE_META_KEYS = [
    'cached_portfolio',
    'cached_chart_data',
    'cached_delta',
    'cached_range',
    'cached_custom_ts',
    'cached_currency',
];

export async function clearCache() {
    for (const key of CACHE_META_KEYS) {
        mem.meta.delete(key);
    }
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
    await clearCache();
}

export async function deleteTransaction(id) {
    mem.transactions = mem.transactions.filter((t) => Number(t.id) !== Number(id));
    await syncAllHoldingsFromTransactions();
    await clearCache();
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
    await clearCache();
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
    if (!mem.transactions || mem.transactions.length === 0) {
        mem.holdings = {};
        return {};
    }
    const normalized = mem.transactions.map((t) => ({
        symbol: t.symbol,
        amount: Number(t.amount || 0),
        way: String(t.way || '').toUpperCase(),
    }));
    mem.holdings = computeHoldingsFromTxns(normalized);
    return { ...mem.holdings };
}

export async function replaceAllTransactions(txns) {
    debugLog('[DB][web] replaceAllTransactions:', txns.length);
    const nextTransactions = txns.map((t, index) => ({
        id: index + 1,
        date_iso: t.dateISO,
        way: t.way,
        symbol: t.symbol,
        amount: t.amount,
        quote_amount: t.quoteAmount ?? 0,
        quote_currency: t.quoteCurrency ?? null,
    }));
    const nextHoldings = computeHoldingsFromTxns(nextTransactions.map((t) => ({
        symbol: t.symbol,
        amount: Number(t.amount || 0),
        way: String(t.way || '').toUpperCase(),
    })));

    mem.transactions = nextTransactions;
    mem.holdings = nextHoldings;
    await clearCache();
}

/* ---------------- CACHE ---------------- */

export async function saveCache(portfolio, chartData, delta, range, currency) {
    await setMeta('cached_portfolio', JSON.stringify(portfolio));
    await setMeta('cached_chart_data', JSON.stringify(chartData));
    await setMeta('cached_delta', JSON.stringify(delta));
    await setMeta('cached_range', range);
    await setMeta('cached_custom_ts', Date.now().toString());
    await setMeta('cached_currency', String(currency || '').toUpperCase());
}

export async function loadCache(currency) {
    try {
        const portfolio = await getMeta('cached_portfolio');
        const chartData = await getMeta('cached_chart_data');
        const delta = await getMeta('cached_delta');
        const range = await getMeta('cached_range');
        const timestamp = await getMeta('cached_custom_ts');
        const cachedCurrency = await getMeta('cached_currency');
        const requestedCurrency = String(currency || '').toUpperCase();

        if (!portfolio || !chartData || !cachedCurrency || (requestedCurrency && cachedCurrency !== requestedCurrency)) return null;

        return {
            portfolio: JSON.parse(portfolio),
            chartData: JSON.parse(chartData),
            delta: delta ? JSON.parse(delta) : { val: 0, pct: 0 },
            range: range || '1D',
            currency: cachedCurrency,
            timestamp: timestamp ? Number(timestamp) : 0,
        };
    } catch (error) {
        console.error('[DB][web] loadCache Error', error);
        return null;
    }
}
