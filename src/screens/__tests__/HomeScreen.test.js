/* global afterAll */

import React from 'react';
import { fireEvent, render, waitFor } from '@testing-library/react-native';
import HomeScreen from '../HomeScreen';

jest.mock('expo-router', () => ({
    router: {
        push: jest.fn(),
        back: jest.fn(),
        replace: jest.fn(),
    },
}));

jest.mock('expo-document-picker', () => ({
    getDocumentAsync: jest.fn(),
}));

jest.mock('expo-file-system/legacy', () => ({
    readAsStringAsync: jest.fn(),
}));

jest.mock('../../db', () => ({
    initDb: jest.fn().mockResolvedValue(undefined),
    getAllTransactions: jest.fn().mockResolvedValue([]),
    getHoldingsMap: jest.fn().mockResolvedValue({}),
    getMeta: jest.fn().mockResolvedValue('EUR'),
    loadCache: jest.fn().mockResolvedValue(null),
    saveCache: jest.fn().mockResolvedValue(undefined),
    clearAllData: jest.fn().mockResolvedValue(undefined),
    insertTransactions: jest.fn().mockResolvedValue(undefined),
    upsertHoldings: jest.fn().mockResolvedValue(undefined),
    setMeta: jest.fn().mockResolvedValue(undefined),
}));

jest.mock('../../cryptoCompare', () => ({
    fetchPortfolioPrices: jest.fn().mockResolvedValue([]),
}));

jest.mock('../../csv', () => ({
    parseDeltaCsvToTxns: jest.fn(),
    computeHoldingsFromTxns: jest.fn(),
}));

jest.mock('../../utils/theme', () => ({
    useTheme: () => ({
        colors: {
            background: '#000',
            text: '#fff',
            textSecondary: '#999',
            surface: '#111',
            surfaceElevated: '#222',
            primary: '#3b82f6',
            primaryInverse: '#fff',
            success: '#22c55e',
            successBg: '#22c55e20',
            successLight: '#4ade80',
            error: '#ef4444',
            errorBg: '#ef444420',
            errorLight: '#f87171',
            borderLight: '#333',
        },
        isDark: true,
    }),
}));

jest.mock('../../utils/portfolioHistory', () => ({
    computePortfolioHistory: jest.fn().mockResolvedValue({
        chartData: [],
        delta: { val: 0, pct: 0 },
        chartColor: '#22c55e',
        coinDeltas: {},
    }),
}));

jest.mock('../../components/CoinIcon', () => {
    const React = require('react');
    // Use string element type to avoid importing react-native which triggers Flow parsing issues
    return function MockCoinIcon() {
        return React.createElement('View', { testID: 'coin-icon' });
    };
});

jest.mock('../../components/CryptoGraph', () => {
    const React = require('react');
    return function MockCryptoGraph() {
        return React.createElement('View', { testID: 'mock-crypto-graph' });
    };
});

describe('HomeScreen', () => {
    const originalDev = globalThis.__DEV__;
    const mockPortfolio = [
        { symbol: 'BTC', quantity: 1, price: 50000, value: 50000, change24h: 2.5 },
        { symbol: 'ETH', quantity: 10, price: 3000, value: 30000, change24h: 1.5 },
        { symbol: 'XRP', quantity: 100, price: 0.5, value: 50, change24h: 0.5 },
        { symbol: 'DOGE', quantity: 1000, price: 0.005, value: 5, change24h: -0.5 },
        { symbol: 'ADA', quantity: 200, price: 0.03, value: 6, change24h: 0.8 },
    ];

    beforeEach(() => {
        jest.clearAllMocks();
        globalThis.__DEV__ = false;
        const db = require('../../db');
        const cryptoCompare = require('../../cryptoCompare');

        db.getHoldingsMap.mockResolvedValue({
            BTC: 1,
            ETH: 10,
            XRP: 100,
            DOGE: 1000,
            ADA: 200,
        });
        db.getAllTransactions.mockResolvedValue([]);
        cryptoCompare.fetchPortfolioPrices.mockResolvedValue(mockPortfolio);
    });

    afterAll(() => {
        globalThis.__DEV__ = originalDev;
    });

    it('hides assets below $10 by default and shows toggle count', async () => {
        const { getByText, queryByText } = render(<HomeScreen />);

        await waitFor(() => {
            expect(getByText('BTC')).toBeTruthy();
            expect(getByText('ETH')).toBeTruthy();
            expect(getByText('XRP')).toBeTruthy();
            expect(getByText(/Show 2/i)).toBeTruthy();
        }, { timeout: 3000 });

        expect(queryByText('DOGE')).toBeNull();
        expect(queryByText('ADA')).toBeNull();
    });

    it('expands and collapses small balances', async () => {
        const { getByText, queryByText } = render(<HomeScreen />);

        await waitFor(() => {
            expect(getByText(/Show 2/i)).toBeTruthy();
        });

        fireEvent.press(getByText(/Show 2/i));

        await waitFor(() => {
            expect(getByText('DOGE')).toBeTruthy();
            expect(getByText('ADA')).toBeTruthy();
            expect(getByText(/Hide/i)).toBeTruthy();
        });

        fireEvent.press(getByText(/Hide/i));

        await waitFor(() => {
            expect(queryByText('DOGE')).toBeNull();
            expect(queryByText('ADA')).toBeNull();
            expect(getByText(/Show 2/i)).toBeTruthy();
        });
    });

    it('does not show small-balance toggle when all assets are >= $10', async () => {
        const db = require('../../db');
        const cryptoCompare = require('../../cryptoCompare');

        db.getHoldingsMap.mockResolvedValue({ BTC: 1, ETH: 10 });
        cryptoCompare.fetchPortfolioPrices.mockResolvedValue([
            { symbol: 'BTC', quantity: 1, price: 50000, value: 50000, change24h: 2.5 },
            { symbol: 'ETH', quantity: 10, price: 3000, value: 30000, change24h: 1.5 },
        ]);

        const { queryByText } = render(<HomeScreen />);

        await waitFor(() => {
            expect(queryByText(/Small Balances/i)).toBeNull();
        });
    });

    it('shows asset with exactly $10 and hides values below $10', async () => {
        const db = require('../../db');
        const cryptoCompare = require('../../cryptoCompare');

        db.getHoldingsMap.mockResolvedValue({ BTC: 1, EXACT: 10, BELOW: 100 });
        cryptoCompare.fetchPortfolioPrices.mockResolvedValue([
            { symbol: 'BTC', quantity: 1, price: 50000, value: 50000, change24h: 2.5 },
            { symbol: 'EXACT', quantity: 10, price: 1, value: 10, change24h: 0 },
            { symbol: 'BELOW', quantity: 100, price: 0.09, value: 9, change24h: 0 },
        ]);

        const { getByText, queryByText } = render(<HomeScreen />);

        await waitFor(() => {
            expect(getByText('BTC')).toBeTruthy();
            expect(getByText('EXACT')).toBeTruthy();
            expect(queryByText('BELOW')).toBeNull();
        });
    });

    it('computes graph with default range 1D on load', async () => {
        const history = require('../../utils/portfolioHistory');
        render(<HomeScreen />);

        await waitFor(() => {
            expect(history.computePortfolioHistory).toHaveBeenCalledWith(
                expect.objectContaining({ range: '1D' })
            );
        });
    });
});
