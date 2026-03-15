/* global afterAll */

import React from 'react';
import { Alert } from 'react-native';
import { render, fireEvent, waitFor, act } from '@testing-library/react-native';

// ── 1. Router ──────────────────────────────────────────────────────────────
jest.mock('expo-router', () => ({
    router: {
        push: jest.fn(),
        back: jest.fn(),
        replace: jest.fn(),
    },
    useLocalSearchParams: jest.fn(() => ({})),
}));

// ── 2. DB — real SQLite :memory: database via better-sqlite3 ──────────────
//    db.jest.js runs the same schema + SQL as db.native.js but uses a
//    Node.js in-process SQLite (no server, no Docker needed).
//    Every export is wrapped with jest.fn() so tests can assert on calls
//    while the real SQLite logic executes underneath.
jest.mock('../../db', () => {
    const actual = require('../../db.jest');
    const wrapped = {};
    for (const [key, val] of Object.entries(actual)) {
        if (typeof val === 'function') {
            const fn = val;
            wrapped[key] = jest.fn((...args) => fn(...args));
        } else {
            wrapped[key] = val;
        }
    }
    return wrapped;
});

// ── 3. CryptoCompare — MUST mock: real HTTP calls to external API ──────────
jest.mock('../../cryptoCompare', () => ({
    fetchPortfolioPrices: jest.fn().mockImplementation(async (holdings) => {
        const list = [];
        for (const [symbol, qty] of Object.entries(holdings)) {
            if (qty > 0) list.push({ symbol, quantity: qty, price: 50000, value: qty * 50000, change24h: 5.0 });
        }
        return list;
    }),
    fetchCandles: jest.fn().mockResolvedValue([
        { time: 1000, open: 40000, high: 45000, low: 39000, close: 40000 },
        { time: 2000, open: 40000, high: 55000, low: 39500, close: 50000 },
    ]),
    fetchFxRates: jest.fn().mockResolvedValue({}),
}));

// ── 4. CSV — real: parseDeltaCsvWithReport is a pure string parser, no IO ──
//    computeHoldingsFromTxns is already used by db.jest.js via require('./csv').
//    No need to mock anything here; jest resolves the real module.

// ── 5. Theme — real: useTheme calls useColorScheme() which returns null in ──
//    Jest (→ isDark=false, light-mode colours). Just a plain JS object.
//    Tests don't assert on colours so this changes nothing observable.

// ── 6. Portfolio history — INTENTIONALLY mocked ────────────────────────────
//    Mock candle timestamps are epoch-1970; the real function builds a time
//    grid from Date.now() so candles would never align → all-zero graph.
//    The real implementation has its own test suite (portfolioHistory.test.js).
jest.mock('../../utils/portfolioHistory', () => ({
    computePortfolioHistory: jest.fn().mockImplementation(async ({ allTxns }) => {
        if (allTxns && allTxns.length > 0) {
            return {
                chartData: [{ time: 100, value: 40000 }, { time: 200, value: 50000 }],
                delta: { val: 10000, pct: 25 },
                chartColor: '#22c55e',
                coinDeltas: { BTC: { val: 1000, pct: 2 } },
            };
        }
        return { chartData: [], delta: { val: 0, pct: 0 }, chartColor: '#999', coinDeltas: {} };
    }),
}));

// ── 7. Expo / native utilities ─────────────────────────────────────────────
jest.mock('expo-document-picker', () => ({ getDocumentAsync: jest.fn() }));
jest.mock('expo-file-system/legacy', () => ({ readAsStringAsync: jest.fn() }));
jest.mock('../../components/CoinIcon', () => 'CoinIcon');
jest.mock('../../components/CryptoGraph', () => {
    const React = require('react');
    const { Text } = require('react-native');
    return ({ data }) => React.createElement(Text, { testID: 'graph-data-len' }, `Graph Points: ${data ? data.length : 0}`);
});

// ── 8. Format — real: Intl.NumberFormat is available in Node.js ───────────
//    Pure functions, no native modules. The /75,000/ /50,000/ regexes still
//    match the real formatMoney output (€75,000) in the default test locale.

// ── Imports (after mocks) ──────────────────────────────────────────────────
const HomeScreen            = require('../HomeScreen').default;
const AddTransactionScreen  = require('../../../app/add-transaction').default;
const CoinScreen            = require('../CoinScreen').default;
const { router, useLocalSearchParams } = require('expo-router');
const DB = require('../../db');

// ── Alert helpers ──────────────────────────────────────────────────────────
function lastAlertButtons() {
    const calls = Alert.alert.mock.calls;
    return calls.length ? (calls[calls.length - 1][2] || []) : [];
}

function pressAlertButton(label) {
    const btn = lastAlertButtons().find(b => b.text === label);
    if (!btn) throw new Error(`Alert button "${label}" not found. Got: ${lastAlertButtons().map(b => b.text).join(', ')}`);
    if (btn.onPress) btn.onPress();
}

// ══════════════════════════════════════════════════════════════════════════════
// Suite 1 — Add Transaction → Home (unchanged from Functional.test.js)
// ══════════════════════════════════════════════════════════════════════════════
describe('Functional Flow: Add Transaction -> Home Update', () => {
    const originalDevFlag = globalThis.__DEV__;

    beforeEach(async () => {
        jest.clearAllMocks();
        useLocalSearchParams.mockReturnValue({});
        await DB.clearAllData();
        globalThis.__DEV__ = false;
    });

    afterAll(() => { globalThis.__DEV__ = originalDevFlag; });

    const pressButtonByTestId = (screen, testId) => {
        let current = screen.getByTestId(testId);
        while (current && !current?.props?.onPress) current = current.parent;
        if (!current?.props?.onPress) throw new Error(`Control ${testId} does not expose onPress`);
        return current.props.onPress();
    };

    const submitTransaction = async ({ symbol, amount, price, way = 'BUY' }) => {
        const addScreen = render(<AddTransactionScreen />);

        if (way === 'SELL') {
            await act(async () => { pressButtonByTestId(addScreen, 'add-tx-type-sell'); });
        }

        await act(async () => {
            fireEvent.changeText(addScreen.getByTestId('add-tx-symbol-input'), symbol);
            fireEvent.changeText(addScreen.getByTestId('add-tx-amount-input'), String(amount));
            fireEvent.changeText(addScreen.getByTestId('add-tx-price-input'), String(price));
        });

        await act(async () => { await pressButtonByTestId(addScreen, 'add-tx-save-button'); });

        await waitFor(() => {
            expect(DB.insertTransactions).toHaveBeenCalled();
            expect(router.back).toHaveBeenCalled();
        }, { timeout: 10000 });

        addScreen.unmount();
    };

    const expectHomeValue = async ({ symbol, expectedValueRegex, expectedPoints = 2 }) => {
        const homeScreen = render(<HomeScreen />);

        await waitFor(() => expect(homeScreen.getByText(symbol)).toBeTruthy(), { timeout: 10000 });
        expect(homeScreen.getAllByText(expectedValueRegex).length).toBeGreaterThan(0);
        expect(homeScreen.getByTestId('graph-data-len').props.children).toBe(`Graph Points: ${expectedPoints}`);

        homeScreen.unmount();
    };

    it('starts empty and keeps portfolio totals correct after buy/sell/buy/sell sequence', async () => {
        const initialHome = render(<HomeScreen />);
        await waitFor(() => expect(DB.getAllTransactions).toHaveBeenCalled(), { timeout: 10000 });
        expect(initialHome.queryByText('BTC')).toBeNull();
        expect(initialHome.getByTestId('graph-data-len').props.children).toBe('Graph Points: 0');
        initialHome.unmount();

        // BUY 1.5 → value 75,000
        await submitTransaction({ symbol: 'BTC', amount: 1.5, price: 50000, way: 'BUY' });
        let txs = await DB.getAllTransactions();
        expect(txs.length).toBe(1);
        expect(txs[0]).toMatchObject({ symbol: 'BTC', amount: 1.5, quote_amount: 75000, way: 'BUY' });
        await expectHomeValue({ symbol: 'BTC', expectedValueRegex: /75,000/ });

        // SELL 0.5 → holdings 1.0 → value 50,000
        await submitTransaction({ symbol: 'BTC', amount: 0.5, price: 55000, way: 'SELL' });
        txs = await DB.getAllTransactions();
        expect(txs.length).toBe(2);
        await expectHomeValue({ symbol: 'BTC', expectedValueRegex: /50,000/ });

        // BUY 0.2 → holdings 1.2 → value 60,000
        await submitTransaction({ symbol: 'BTC', amount: 0.2, price: 52000, way: 'BUY' });
        txs = await DB.getAllTransactions();
        expect(txs.length).toBe(3);
        await expectHomeValue({ symbol: 'BTC', expectedValueRegex: /60,000/ });

        // SELL 0.2 → holdings 1.0 → value 50,000
        await submitTransaction({ symbol: 'BTC', amount: 0.2, price: 53000, way: 'SELL' });
        txs = await DB.getAllTransactions();
        expect(txs.length).toBe(4);
        await expectHomeValue({ symbol: 'BTC', expectedValueRegex: /50,000/ });
    }, 60000);
});

// ══════════════════════════════════════════════════════════════════════════════
// Suite 2 — Edit (update) a transaction
// ══════════════════════════════════════════════════════════════════════════════
describe('Functional Flow: Edit Transaction', () => {
    const originalDevFlag = globalThis.__DEV__;

    beforeEach(async () => {
        jest.clearAllMocks();
        await DB.clearAllData();
        globalThis.__DEV__ = false;

        // Seed one transaction then set params so AddTransactionScreen opens in edit mode
        await DB.insertTransactions([{
            dateISO: '2024-01-15T00:00:00.000Z',
            symbol: 'BTC',
            way: 'BUY',
            amount: 0.5,
            quoteAmount: 25000,
            quoteCurrency: 'EUR',
        }]);

        const tx = (await DB.getAllTransactions())[0];
        // Clear call history from seeding so tests only see their own calls
        jest.clearAllMocks();
        useLocalSearchParams.mockReturnValue({ id: String(tx.id), symbol: 'BTC' });
    });

    afterAll(() => { globalThis.__DEV__ = originalDevFlag; });

    it('pre-populates the form with the existing transaction data', async () => {
        const { getByTestId } = render(<AddTransactionScreen />);

        await waitFor(() => expect(DB.getTransactionById).toHaveBeenCalled());

        await waitFor(() => {
            expect(getByTestId('add-tx-symbol-input').props.value).toBe('BTC');
            expect(getByTestId('add-tx-amount-input').props.value).toBe('0.5');
            // price-per-coin = quote_amount / amount = 25000 / 0.5
            expect(getByTestId('add-tx-price-input').props.value).toBe('50000');
        });
    });

    it('calls updateTransaction (not insertTransactions) on save', async () => {
        const { getByTestId } = render(<AddTransactionScreen />);

        await waitFor(() => expect(DB.getTransactionById).toHaveBeenCalled());

        await act(async () => { fireEvent.press(getByTestId('add-tx-save-button')); });

        await waitFor(() => expect(DB.updateTransaction).toHaveBeenCalled());
        expect(DB.insertTransactions).not.toHaveBeenCalled();
    });

    it('saves the changed amount and price correctly', async () => {
        const tx = (await DB.getAllTransactions())[0];
        const { getByTestId } = render(<AddTransactionScreen />);

        await waitFor(() => expect(DB.getTransactionById).toHaveBeenCalled());

        await act(async () => {
            fireEvent.changeText(getByTestId('add-tx-amount-input'), '0.75');
            fireEvent.changeText(getByTestId('add-tx-price-input'), '48000');
        });

        await act(async () => { fireEvent.press(getByTestId('add-tx-save-button')); });

        await waitFor(() =>
            expect(DB.updateTransaction).toHaveBeenCalledWith(
                String(tx.id),
                expect.objectContaining({
                    symbol: 'BTC',
                    way: 'BUY',
                    amount: 0.75,
                    quoteAmount: 36000, // 0.75 × 48,000
                })
            )
        );
    });

    it('syncs holdings and navigates back after a successful update', async () => {
        const { getByTestId } = render(<AddTransactionScreen />);

        await waitFor(() => expect(DB.getTransactionById).toHaveBeenCalled());

        await act(async () => { fireEvent.press(getByTestId('add-tx-save-button')); });

        await waitFor(() => {
            expect(DB.syncHoldingsForSymbol).toHaveBeenCalledWith('BTC');
            expect(router.back).toHaveBeenCalled();
        });
    });

    it('persists a type change (BUY → SELL) in the update payload', async () => {
        const { getByTestId } = render(<AddTransactionScreen />);

        await waitFor(() => expect(DB.getTransactionById).toHaveBeenCalled());

        await act(async () => { fireEvent.press(getByTestId('add-tx-type-sell')); });
        await act(async () => { fireEvent.press(getByTestId('add-tx-save-button')); });

        await waitFor(() =>
            expect(DB.updateTransaction).toHaveBeenCalledWith(
                expect.any(String),
                expect.objectContaining({ way: 'SELL' })
            )
        );
    });
});

// ══════════════════════════════════════════════════════════════════════════════
// Suite 3 — Delete a transaction from CoinScreen
// ══════════════════════════════════════════════════════════════════════════════
describe('Functional Flow: Delete Transaction via CoinScreen', () => {
    const originalDevFlag = globalThis.__DEV__;
    let alertSpy;
    let seededTx;

    beforeEach(async () => {
        jest.clearAllMocks();
        await DB.clearAllData();
        globalThis.__DEV__ = false;

        await DB.insertTransactions([{
            dateISO: '2024-03-01T00:00:00.000Z',
            symbol: 'ETH',
            way: 'BUY',
            amount: 2,
            quoteAmount: 4000,
            quoteCurrency: 'EUR',
        }]);

        seededTx = (await DB.getAllTransactions())[0];
        // Clear call history from seeding so tests only see their own calls
        jest.clearAllMocks();
        useLocalSearchParams.mockReturnValue({ symbol: 'ETH' });

        alertSpy = jest.spyOn(Alert, 'alert').mockImplementation(() => {});
    });

    afterEach(() => alertSpy.mockRestore());
    afterAll(() => { globalThis.__DEV__ = originalDevFlag; });

    const renderAndWait = async () => {
        const screen = render(<CoinScreen />);
        await waitFor(() => expect(DB.listTransactionsBySymbol).toHaveBeenCalledWith('ETH'));
        await waitFor(() => screen.getByTestId(`tx-options-btn-${seededTx.id}`));
        return screen;
    };

    it('shows Edit, Delete and Cancel buttons in the options alert', async () => {
        const screen = await renderAndWait();

        await act(async () => { fireEvent.press(screen.getByTestId(`tx-options-btn-${seededTx.id}`)); });

        expect(alertSpy).toHaveBeenCalled();
        const labels = lastAlertButtons().map(b => b.text);
        expect(labels).toContain('general.edit');
        expect(labels).toContain('general.delete');
        expect(labels).toContain('general.cancel');
    });

    it('shows a confirmation alert after choosing Delete', async () => {
        const screen = await renderAndWait();

        await act(async () => { fireEvent.press(screen.getByTestId(`tx-options-btn-${seededTx.id}`)); });
        await act(async () => { pressAlertButton('general.delete'); });

        expect(alertSpy).toHaveBeenCalledTimes(2);
        const labels = lastAlertButtons().map(b => b.text);
        expect(labels).toContain('general.delete');
        expect(labels).toContain('general.cancel');
    });

    it('calls deleteTransaction with the correct id after confirming', async () => {
        const screen = await renderAndWait();

        await act(async () => { fireEvent.press(screen.getByTestId(`tx-options-btn-${seededTx.id}`)); });
        await act(async () => { pressAlertButton('general.delete'); }); // options → delete
        await act(async () => { pressAlertButton('general.delete'); }); // confirm → delete

        await waitFor(() => expect(DB.deleteTransaction).toHaveBeenCalledWith(seededTx.id));
    });

    it('syncs holdings after confirming delete', async () => {
        const screen = await renderAndWait();

        await act(async () => { fireEvent.press(screen.getByTestId(`tx-options-btn-${seededTx.id}`)); });
        await act(async () => { pressAlertButton('general.delete'); });
        await act(async () => { pressAlertButton('general.delete'); });

        await waitFor(() => expect(DB.syncHoldingsForSymbol).toHaveBeenCalledWith('ETH'));
    });

    it('re-fetches the transaction list after confirming delete', async () => {
        const screen = await renderAndWait();
        const callsBefore = DB.listTransactionsBySymbol.mock.calls.length;

        await act(async () => { fireEvent.press(screen.getByTestId(`tx-options-btn-${seededTx.id}`)); });
        await act(async () => { pressAlertButton('general.delete'); });
        await act(async () => { pressAlertButton('general.delete'); });

        await waitFor(() =>
            expect(DB.listTransactionsBySymbol.mock.calls.length).toBeGreaterThan(callsBefore)
        );
    });

    it('does NOT delete when Cancel is pressed in the confirmation dialog', async () => {
        const screen = await renderAndWait();

        await act(async () => { fireEvent.press(screen.getByTestId(`tx-options-btn-${seededTx.id}`)); });
        await act(async () => { pressAlertButton('general.delete'); }); // options → delete
        await act(async () => { pressAlertButton('general.cancel'); }); // confirm → cancel

        expect(DB.deleteTransaction).not.toHaveBeenCalled();
    });

    it('does NOT delete when Cancel is pressed in the options dialog', async () => {
        const screen = await renderAndWait();

        await act(async () => { fireEvent.press(screen.getByTestId(`tx-options-btn-${seededTx.id}`)); });
        await act(async () => { pressAlertButton('general.cancel'); }); // options → cancel

        expect(DB.deleteTransaction).not.toHaveBeenCalled();
        expect(alertSpy).toHaveBeenCalledTimes(1);
    });

    it('navigates to add-transaction with the correct id when Edit is pressed', async () => {
        const screen = await renderAndWait();

        await act(async () => { fireEvent.press(screen.getByTestId(`tx-options-btn-${seededTx.id}`)); });
        await act(async () => { pressAlertButton('general.edit'); });

        expect(router.push).toHaveBeenCalledWith(
            expect.objectContaining({
                pathname: '/add-transaction',
                params: expect.objectContaining({ id: seededTx.id }),
            })
        );
    });
});

