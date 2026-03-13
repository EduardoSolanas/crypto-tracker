/* global afterAll */

import React from 'react';
import { render, fireEvent, waitFor, act } from '@testing-library/react-native';

// --- Mocks Setup (Hoisted) ---

// 1. Mock Router
jest.mock('expo-router', () => ({
  router: {
    push: jest.fn(),
    back: jest.fn(),
    replace: jest.fn(),
  },
  useLocalSearchParams: jest.fn(() => ({})),
}));

// 2. Mock DB (In-Memory Implementation)
// Using doMock or defining inside factory to ensure hoisting doesn't break references
jest.mock('../../db', () => {
    const transactions = [];
    return {
        __esModule: true,
        initDb: jest.fn().mockResolvedValue(undefined),
        getAllTransactions: jest.fn().mockImplementation(async () => [...transactions]),
        getHoldingsMap: jest.fn().mockImplementation(async () => {
            const holdings = {};
            transactions.forEach(t => {
                if (!holdings[t.symbol]) holdings[t.symbol] = 0;
                if (t.way === 'BUY' || t.way === 'DEPOSIT') holdings[t.symbol] += t.amount;
                if (t.way === 'SELL' || t.way === 'WITHDRAW') holdings[t.symbol] -= t.amount;
            });
            return holdings;
        }),
        getMeta: jest.fn().mockResolvedValue('EUR'),
        setMeta: jest.fn().mockResolvedValue(undefined),
        insertTransactions: jest.fn().mockImplementation(async (txns) => {
            transactions.push(...txns);
        }),
        updateTransaction: jest.fn().mockImplementation(async (id, data) => {
            const idx = transactions.findIndex(t => t.id === id);
            if (idx >= 0) transactions[idx] = { ...transactions[idx], ...data };
        }),
        getTransactionById: jest.fn(),
        syncHoldingsForSymbol: jest.fn().mockResolvedValue(undefined),
        loadCache: jest.fn().mockResolvedValue(null),
        saveCache: jest.fn().mockResolvedValue(undefined),
        clearAllData: jest.fn().mockImplementation(async () => {
            transactions.length = 0;
        })
    };
});

// 3. Mock CryptoCompare
jest.mock('../../cryptoCompare', () => ({
  fetchPortfolioPrices: jest.fn().mockImplementation(async (holdings) => {
    const list = [];
    for (const [symbol, qty] of Object.entries(holdings)) {
      if (qty > 0) {
        list.push({
          symbol,
          quantity: qty,
          price: 50000,
          value: qty * 50000,
          change24h: 5.0,
        });
      }
    }
    return list;
  }),
  fetchCandles: jest.fn().mockResolvedValue([
    { time: 1000, close: 40000 },
    { time: 2000, close: 50000 },
  ]),
}));

// 4. Mock CSV
jest.mock('../../csv', () => {
  const actual = jest.requireActual('../../csv');
  return {
    ...actual,
    parseDeltaCsvWithReport: jest.fn(),
  };
});

// 5. Mock Theme
jest.mock('../../utils/theme', () => ({
  useTheme: () => ({
    colors: {
      background: '#000',
      text: '#fff',
      textSecondary: '#999',
      surface: '#111',
      primary: '#3b82f6',
      success: '#22c55e',
      error: '#ef4444',
    },
    isDark: true,
  }),
}));

// 6. Mock PortfolioHistory
jest.mock('../../utils/portfolioHistory', () => ({
  computePortfolioHistory: jest.fn().mockImplementation(async ({ allTxns }) => {
     if (allTxns.length > 0) {
         return {
             chartData: [{ time: 100, value: 40000 }, { time: 200, value: 50000 }],
             delta: { val: 10000, pct: 25 },
             chartColor: '#22c55e',
             coinDeltas: { 'BTC': { val: 1000, pct: 2 } }
         };
     }
     return {
         chartData: [],
         delta: { val: 0, pct: 0 },
         chartColor: '#999',
         coinDeltas: {}
     };
  }),
}));

// 7. Expo Utils
jest.mock('expo-document-picker', () => ({ getDocumentAsync: jest.fn() }));
jest.mock('expo-file-system/legacy', () => ({ readAsStringAsync: jest.fn() }));
jest.mock('../../components/CoinIcon', () => 'CoinIcon');
jest.mock('../../components/CryptoGraph', () => {
    const React = require('react');
    const { Text } = require('react-native');
    return ({ data }) => React.createElement(Text, { testID: 'graph-data-len' }, `Graph Points: ${data ? data.length : 0}`);
});

// 8. Mock Format
jest.mock('../../utils/format', () => ({
  formatMoney: jest.fn((val, cur) => `${cur === 'EUR' ? '€' : cur} ${Number(val).toLocaleString()}`),
}));

// Import components AFTER mocks
const HomeScreen = require('../HomeScreen').default;
const AddTransactionScreen = require('../../../app/add-transaction').default;
const { router } = require('expo-router');
const DB = require('../../db');

describe('Functional Flow: Add Transaction -> Home Update', () => {
  const originalDevFlag = globalThis.__DEV__;

  beforeEach(async () => {
    jest.clearAllMocks();
    await DB.clearAllData();
    globalThis.__DEV__ = false;
  });

  afterAll(() => {
    globalThis.__DEV__ = originalDevFlag;
  });

  const pressButtonByTestId = (screen, testId) => {
    let current = screen.getByTestId(testId);
    while (current && !current?.props?.onPress) {
      current = current.parent;
    }
    if (!current?.props?.onPress) {
      throw new Error(`Control ${testId} does not expose onPress`);
    }
    return current.props.onPress();
  };

  const submitTransaction = async ({ symbol, amount, price, way = 'BUY' }) => {
    const addScreen = render(<AddTransactionScreen />);

    if (way === 'SELL') {
      await act(async () => {
        pressButtonByTestId(addScreen, 'add-tx-type-sell');
      });
    }

    await act(async () => {
      fireEvent.changeText(addScreen.getByTestId('add-tx-symbol-input'), symbol);
      fireEvent.changeText(addScreen.getByTestId('add-tx-amount-input'), String(amount));
      fireEvent.changeText(addScreen.getByTestId('add-tx-price-input'), String(price));
    });

    await act(async () => {
      await pressButtonByTestId(addScreen, 'add-tx-save-button');
    });

    await waitFor(() => {
      expect(DB.insertTransactions).toHaveBeenCalled();
      expect(router.back).toHaveBeenCalled();
    }, { timeout: 10000 });

    addScreen.unmount();
  };

  const expectHomeValue = async ({ symbol, expectedValueRegex, expectedPoints = 2 }) => {
    const homeScreen = render(<HomeScreen />);

    await waitFor(() => {
      expect(homeScreen.getByText(symbol)).toBeTruthy();
    }, { timeout: 10000 });

    expect(homeScreen.getAllByText(expectedValueRegex).length).toBeGreaterThan(0);
    expect(homeScreen.getByTestId('graph-data-len').props.children).toBe(`Graph Points: ${expectedPoints}`);

    homeScreen.unmount();
  };

  it('starts empty and keeps portfolio totals correct after buy/sell/buy/sell sequence', async () => {
    // 1) Initial empty Home
    const initialHome = render(<HomeScreen />);
    await waitFor(() => expect(DB.getAllTransactions).toHaveBeenCalled(), { timeout: 10000 });
    expect(initialHome.queryByText('BTC')).toBeNull();
    expect(initialHome.getByTestId('graph-data-len').props.children).toBe('Graph Points: 0');
    initialHome.unmount();

    // 2) BUY BTC 1.5 -> holdings 1.5 -> value 75,000 (mocked 50k price)
    await submitTransaction({ symbol: 'BTC', amount: 1.5, price: 50000, way: 'BUY' });
    let txs = await DB.getAllTransactions();
    expect(txs.length).toBe(1);
    expect(txs[0]).toMatchObject({ symbol: 'BTC', amount: 1.5, quoteAmount: 75000, way: 'BUY' });
    await expectHomeValue({ symbol: 'BTC', expectedValueRegex: /75,000/ });

    // 3) SELL BTC 0.5 -> holdings 1.0 -> value 50,000
    await submitTransaction({ symbol: 'BTC', amount: 0.5, price: 55000, way: 'SELL' });
    txs = await DB.getAllTransactions();
    expect(txs.length).toBe(2);
    await expectHomeValue({ symbol: 'BTC', expectedValueRegex: /50,000/ });

    // 4) BUY BTC 0.2 -> holdings 1.2 -> value 60,000
    await submitTransaction({ symbol: 'BTC', amount: 0.2, price: 52000, way: 'BUY' });
    txs = await DB.getAllTransactions();
    expect(txs.length).toBe(3);
    await expectHomeValue({ symbol: 'BTC', expectedValueRegex: /60,000/ });

    // 5) SELL BTC 0.2 -> holdings 1.0 -> value 50,000
    await submitTransaction({ symbol: 'BTC', amount: 0.2, price: 53000, way: 'SELL' });
    txs = await DB.getAllTransactions();
    expect(txs.length).toBe(4);
    await expectHomeValue({ symbol: 'BTC', expectedValueRegex: /50,000/ });
  }, 60000);
});
