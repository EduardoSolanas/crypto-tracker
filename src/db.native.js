// src/db.native.js
import * as SQLite from 'expo-sqlite';
import { computeHoldingsFromTxns } from './csv';

let dbPromise;
const debugLog = (...args) => {
    if (globalThis.__DEV__) {
        console.log(...args);
    }
};

/**
 * Open (or reuse) the SQLite database.
 */
async function getDb() {
    if (!dbPromise) {
        debugLog('[DB][native] opening database');
        dbPromise = SQLite.openDatabaseAsync('portfolio.db');
    }
    return dbPromise;
}

/**
 * Initialize schema.
 * Called once on app startup.
 */
export async function initDb() {
    debugLog('[DB][native] initDb');
    const db = await getDb();

    await db.execAsync(`
    PRAGMA journal_mode = WAL;

    CREATE TABLE IF NOT EXISTS transactions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      date_iso TEXT NOT NULL,
      way TEXT NOT NULL,
      symbol TEXT NOT NULL,
      amount REAL NOT NULL,
      quote_amount REAL NOT NULL DEFAULT 0,
      quote_currency TEXT
    );

    CREATE INDEX IF NOT EXISTS idx_transactions_symbol
      ON transactions(symbol);

    CREATE INDEX IF NOT EXISTS idx_transactions_date
      ON transactions(date_iso);

    CREATE INDEX IF NOT EXISTS idx_transactions_symbol_date
      ON transactions(symbol, date_iso DESC);

    CREATE TABLE IF NOT EXISTS holdings (
      symbol TEXT PRIMARY KEY,
      quantity REAL NOT NULL
    );

    CREATE TABLE IF NOT EXISTS meta (
      key TEXT PRIMARY KEY,
      value TEXT
    );
  `);

    debugLog('[DB][native] schema ready');
}

/* ---------------- META ---------------- */

export async function setMeta(key, value) {
    const db = await getDb();
    await db.runAsync(
        `
            INSERT INTO meta(key, value)
            VALUES (?, ?)
                ON CONFLICT(key) DO UPDATE SET value = excluded.value
        `,
        [key, String(value)]
    );
}

export async function getMeta(key) {
    const db = await getDb();
    const row = await db.getFirstAsync(
        `SELECT value FROM meta WHERE key = ?`,
        [key]
    );
    return row?.value ?? null;
}

/* ---------------- RESET ---------------- */

export async function clearAllData() {
    debugLog('[DB][native] clearAllData');
    const db = await getDb();
    await db.execAsync(`
        DELETE FROM transactions;
        DELETE FROM holdings;
        DELETE FROM meta WHERE key = 'cache';
    `);
}

/* ---------------- TRANSACTIONS ---------------- */

export async function insertTransactions(txns) {
    debugLog('[DB][native] insertTransactions:', txns.length);
    const db = await getDb();

    await db.execAsync('BEGIN;');
    try {
        for (const t of txns) {
            await db.runAsync(
                `
                    INSERT INTO transactions(
                        date_iso,
                        way,
                        symbol,
                        amount,
                        quote_amount,
                        quote_currency
                    )
                    VALUES (?, ?, ?, ?, ?, ?)
                `,
                [
                    t.dateISO,
                    t.way,
                    t.symbol,
                    t.amount,
                    t.quoteAmount ?? 0,
                    t.quoteCurrency ?? null,
                ]
            );
        }
        await db.execAsync('COMMIT;');
        await syncAllHoldingsFromTransactions();
    } catch (e) {
        await db.execAsync('ROLLBACK;');
        throw e;
    }
}

export async function deleteTransaction(id) {
    debugLog('[DB][native] deleteTransaction:', id);
    const db = await getDb();
    await db.runAsync(`DELETE FROM transactions WHERE id = ?`, [id]);
    await syncAllHoldingsFromTransactions();
}

export async function getTransactionById(id) {
    const db = await getDb();
    return db.getFirstAsync(`SELECT * FROM transactions WHERE id = ?`, [id]);
}

export async function updateTransaction(id, t) {
    debugLog('[DB][native] updateTransaction:', id);
    const db = await getDb();
    await db.runAsync(
        `
            UPDATE transactions
            SET date_iso = ?, way = ?, symbol = ?, amount = ?, quote_amount = ?, quote_currency = ?
            WHERE id = ?
        `,
        [
            t.dateISO,
            t.way,
            t.symbol,
            t.amount,
            t.quoteAmount ?? 0,
            t.quoteCurrency ?? null,
            id
        ]
    );
    await syncAllHoldingsFromTransactions();
}

export async function listTransactionsBySymbol(symbol) {
    const db = await getDb();
    return db.getAllAsync(
        `
            SELECT *
            FROM transactions
            WHERE symbol = ?
            ORDER BY date_iso DESC
        `,
        [symbol]
    );
}

export async function getAllTransactions() {
    const db = await getDb();
    return db.getAllAsync(
        `
            SELECT *
            FROM transactions
            ORDER BY date_iso ASC
        `
    );
}

/* ---------------- HOLDINGS ---------------- */

export async function upsertHoldings(holdingsMap) {
    debugLog('[DB][native] upsertHoldings:', holdingsMap);
    const db = await getDb();

    await db.execAsync('BEGIN;');
    try {
        for (const [symbol, qty] of Object.entries(holdingsMap)) {
            await db.runAsync(
                `
                    INSERT INTO holdings(symbol, quantity)
                    VALUES (?, ?)
                        ON CONFLICT(symbol)
        DO UPDATE SET quantity = excluded.quantity
                `,
                [symbol, qty]
            );
        }

        const symbols = Object.keys(holdingsMap);
        if (symbols.length === 0) {
            await db.execAsync(`DELETE FROM holdings;`);
        } else {
            const placeholders = symbols.map(() => '?').join(',');
            await db.runAsync(
                `DELETE FROM holdings WHERE symbol NOT IN (${placeholders})`,
                symbols
            );
        }

        await db.execAsync('COMMIT;');
    } catch (e) {
        await db.execAsync('ROLLBACK;');
        throw e;
    }
}

export async function getHoldingsMap() {
    const db = await getDb();
    const rows = await db.getAllAsync(
        `SELECT symbol, quantity FROM holdings`
    );

    const map = {};
    for (const r of rows) {
        map[r.symbol] = r.quantity;
    }
    return map;
}

export async function syncHoldingsForSymbol(symbol) {
    debugLog('[DB][native] syncHoldingsForSymbol:', symbol);
    const db = await getDb();

    // Calculate new quantity directly in SQL for speed
    const result = await db.getFirstAsync(
        `
            SELECT SUM(
                CASE 
                    WHEN way IN ('BUY', 'DEPOSIT', 'RECEIVE') THEN amount
                    WHEN way IN ('SELL', 'WITHDRAW', 'SEND') THEN -amount
                    ELSE 0
                END
            ) as total
            FROM transactions 
            WHERE symbol = ?
        `,
        [symbol]
    );

    const newQty = result?.total ?? 0;

    const holdings = await getHoldingsMap();
    if (newQty <= 0) {
        delete holdings[symbol];
    } else {
        holdings[symbol] = newQty;
    }
    await upsertHoldings(holdings);
    return newQty;
}

export async function syncAllHoldingsFromTransactions() {
    const allTxns = await getAllTransactions();
    const normalized = allTxns.map((t) => ({
        symbol: t.symbol,
        amount: Number(t.amount || 0),
        way: String(t.way || '').toUpperCase(),
    }));
    const holdings = computeHoldingsFromTxns(normalized);
    await upsertHoldings(holdings);
    return holdings;
}

/* ---------------- CACHE ---------------- */

export async function saveCache(p, cData, d, r) {
    try {
        await setMeta('cached_portfolio', JSON.stringify(p));
        await setMeta('cached_chart_data', JSON.stringify(cData));
        await setMeta('cached_delta', JSON.stringify(d));
        await setMeta('cached_range', r);
        await setMeta('cached_custom_ts', Date.now().toString());
    } catch (e) {
        console.error('[DB][native] saveCache Error', e);
    }
}

export async function loadCache() {
    try {
        const pStr = await getMeta('cached_portfolio');
        const cStr = await getMeta('cached_chart_data');
        const dStr = await getMeta('cached_delta');
        const rStr = await getMeta('cached_range');
        const tsStr = await getMeta('cached_custom_ts');

        if (pStr && cStr) {
            return {
                portfolio: JSON.parse(pStr),
                chartData: JSON.parse(cStr),
                delta: dStr ? JSON.parse(dStr) : { val: 0, pct: 0 },
                range: rStr || '1D',
                timestamp: tsStr ? Number(tsStr) : 0
            };
        }
    } catch (e) {
        console.error('[DB][native] loadCache Error', e);
    }
    return null;
}
