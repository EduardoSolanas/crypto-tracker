/**
 * db.jest.js — Real SQLite in-memory database for Jest tests.
 *
 * Uses better-sqlite3 (Node.js native binding, no server, no Docker).
 * The database lives in :memory: so it is blazing fast and isolated
 * per Jest worker. Schema and SQL are identical to db.native.js.
 *
 * Every export is async to match the expo-sqlite interface the app uses.
 */
const Database = require('better-sqlite3');
const { computeHoldingsFromTxns } = require('./csv');

// One in-memory DB per Jest worker — reset via clearAllData(), not re-open.
const db = new Database(':memory:');

// ── Schema ────────────────────────────────────────────────────────────────
db.exec(`
    PRAGMA journal_mode = WAL;

    CREATE TABLE IF NOT EXISTS transactions (
        id             INTEGER PRIMARY KEY AUTOINCREMENT,
        date_iso       TEXT    NOT NULL,
        way            TEXT    NOT NULL,
        symbol         TEXT    NOT NULL,
        amount         REAL    NOT NULL,
        quote_amount   REAL    NOT NULL DEFAULT 0,
        quote_currency TEXT
    );

    CREATE INDEX IF NOT EXISTS idx_transactions_symbol
        ON transactions(symbol);

    CREATE INDEX IF NOT EXISTS idx_transactions_date
        ON transactions(date_iso);

    CREATE INDEX IF NOT EXISTS idx_transactions_symbol_date
        ON transactions(symbol, date_iso DESC);

    CREATE TABLE IF NOT EXISTS holdings (
        symbol   TEXT PRIMARY KEY,
        quantity REAL NOT NULL
    );

    CREATE TABLE IF NOT EXISTS meta (
        key   TEXT PRIMARY KEY,
        value TEXT
    );
`);

// ── Init ──────────────────────────────────────────────────────────────────

async function initDb() {
    // Schema already created at module load; nothing else to do.
}

// ── Meta ──────────────────────────────────────────────────────────────────

async function setMeta(key, value) {
    db.prepare(
        `INSERT INTO meta(key, value) VALUES (?, ?)
         ON CONFLICT(key) DO UPDATE SET value = excluded.value`
    ).run(key, String(value));
}

async function getMeta(key) {
    const row = db.prepare(`SELECT value FROM meta WHERE key = ?`).get(key);
    return row?.value ?? null;
}

// ── Reset ─────────────────────────────────────────────────────────────────

async function clearAllData() {
    db.exec(`
        DELETE FROM transactions;
        DELETE FROM holdings;
        DELETE FROM meta WHERE key IN (
            'cached_portfolio','cached_chart_data','cached_delta',
            'cached_range','cached_custom_ts','cache'
        );
    `);
}

// ── Holdings sync (internal) ──────────────────────────────────────────────

async function syncAllHoldingsFromTransactions() {
    const allTxns = db.prepare(`SELECT * FROM transactions ORDER BY date_iso ASC`).all();
    const normalized = allTxns.map((t) => ({
        symbol: t.symbol,
        amount: Number(t.amount || 0),
        way: String(t.way || '').toUpperCase(),
    }));
    const holdings = computeHoldingsFromTxns(normalized);
    await upsertHoldings(holdings);
    return holdings;
}

async function upsertHoldings(holdingsMap) {
    const upsert = db.prepare(
        `INSERT INTO holdings(symbol, quantity) VALUES (?, ?)
         ON CONFLICT(symbol) DO UPDATE SET quantity = excluded.quantity`
    );
    const deleteStale = db.prepare(
        `DELETE FROM holdings WHERE symbol NOT IN (${
            Object.keys(holdingsMap).length
                ? Object.keys(holdingsMap).map(() => '?').join(',')
                : 'SELECT NULL WHERE 0'   // never matches
        })`
    );

    const runAll = db.transaction(() => {
        db.prepare(`DELETE FROM holdings`).run();
        for (const [sym, qty] of Object.entries(holdingsMap)) {
            upsert.run(sym, qty);
        }
    });
    runAll();
    void deleteStale; // kept for symmetry; the transaction already cleared stale rows
}

// ── Transactions ──────────────────────────────────────────────────────────

async function insertTransactions(txns) {
    const insert = db.prepare(
        `INSERT INTO transactions(date_iso, way, symbol, amount, quote_amount, quote_currency)
         VALUES (?, ?, ?, ?, ?, ?)`
    );

    const run = db.transaction(() => {
        for (const t of txns) {
            insert.run(
                t.dateISO,
                t.way,
                t.symbol,
                t.amount,
                t.quoteAmount ?? 0,
                t.quoteCurrency ?? null,
            );
        }
    });
    run();
    await syncAllHoldingsFromTransactions();
}

async function deleteTransaction(id) {
    db.prepare(`DELETE FROM transactions WHERE id = ?`).run(id);
    await syncAllHoldingsFromTransactions();
}

async function getTransactionById(id) {
    return db.prepare(`SELECT * FROM transactions WHERE id = ?`).get(id) ?? null;
}

async function updateTransaction(id, t) {
    db.prepare(
        `UPDATE transactions
         SET date_iso = ?, way = ?, symbol = ?, amount = ?, quote_amount = ?, quote_currency = ?
         WHERE id = ?`
    ).run(
        t.dateISO,
        t.way,
        t.symbol,
        t.amount,
        t.quoteAmount ?? 0,
        t.quoteCurrency ?? null,
        id,
    );
    await syncAllHoldingsFromTransactions();
}

async function listTransactionsBySymbol(symbol) {
    return db
        .prepare(`SELECT * FROM transactions WHERE symbol = ? ORDER BY date_iso DESC`)
        .all(symbol);
}

async function getAllTransactions() {
    return db
        .prepare(`SELECT * FROM transactions ORDER BY date_iso ASC`)
        .all();
}

// ── Holdings ──────────────────────────────────────────────────────────────

async function getHoldingsMap() {
    const rows = db.prepare(`SELECT symbol, quantity FROM holdings`).all();
    const map = {};
    for (const r of rows) map[r.symbol] = r.quantity;
    return map;
}

async function syncHoldingsForSymbol(symbol) {
    await syncAllHoldingsFromTransactions();
    const row = db.prepare(`SELECT quantity FROM holdings WHERE symbol = ?`).get(symbol);
    return row?.quantity ?? 0;
}

// ── Cache ─────────────────────────────────────────────────────────────────

async function saveCache(p, cData, d, r) {
    const pairs = [
        ['cached_portfolio',  JSON.stringify(p)],
        ['cached_chart_data', JSON.stringify(cData)],
        ['cached_delta',      JSON.stringify(d)],
        ['cached_range',      r],
        ['cached_custom_ts',  String(Date.now())],
    ];
    const upsert = db.prepare(
        `INSERT INTO meta(key, value) VALUES (?, ?)
         ON CONFLICT(key) DO UPDATE SET value = excluded.value`
    );
    const run = db.transaction(() => { for (const [k, v] of pairs) upsert.run(k, v); });
    run();
}

async function loadCache() {
    const get = (k) => db.prepare(`SELECT value FROM meta WHERE key = ?`).get(k)?.value;
    const pStr  = get('cached_portfolio');
    const cStr  = get('cached_chart_data');
    const dStr  = get('cached_delta');
    const rStr  = get('cached_range');
    const tsStr = get('cached_custom_ts');
    if (pStr && cStr) {
        return {
            portfolio:  JSON.parse(pStr),
            chartData:  JSON.parse(cStr),
            delta:      dStr ? JSON.parse(dStr) : { val: 0, pct: 0 },
            range:      rStr || '1D',
            timestamp:  tsStr ? Number(tsStr) : 0,
        };
    }
    return null;
}

// ── Exports ───────────────────────────────────────────────────────────────

module.exports = {
    initDb,
    setMeta,
    getMeta,
    clearAllData,
    insertTransactions,
    deleteTransaction,
    getTransactionById,
    updateTransaction,
    listTransactionsBySymbol,
    getAllTransactions,
    upsertHoldings,
    getHoldingsMap,
    syncHoldingsForSymbol,
    syncAllHoldingsFromTransactions,
    saveCache,
    loadCache,
};

