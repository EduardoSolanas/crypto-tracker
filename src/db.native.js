// src/db.native.js
import * as SQLite from 'expo-sqlite';

let dbPromise;

/**
 * Open (or reuse) the SQLite database.
 */
async function getDb() {
    if (!dbPromise) {
        console.log('[DB][native] opening database');
        dbPromise = SQLite.openDatabaseAsync('portfolio.db');
    }
    return dbPromise;
}

/**
 * Initialize schema.
 * Called once on app startup.
 */
export async function initDb() {
    console.log('[DB][native] initDb');
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

    CREATE TABLE IF NOT EXISTS holdings (
      symbol TEXT PRIMARY KEY,
      quantity REAL NOT NULL
    );

    CREATE TABLE IF NOT EXISTS meta (
      key TEXT PRIMARY KEY,
      value TEXT
    );
  `);

    console.log('[DB][native] schema ready');
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
    console.log('[DB][native] clearAllData');
    const db = await getDb();
    await db.execAsync(`
        DELETE FROM transactions;
        DELETE FROM holdings;
    `);
}

/* ---------------- TRANSACTIONS ---------------- */

export async function insertTransactions(txns) {
    console.log('[DB][native] insertTransactions:', txns.length);
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
    } catch (e) {
        await db.execAsync('ROLLBACK;');
        throw e;
    }
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
    console.log('[DB][native] upsertHoldings:', holdingsMap);
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
