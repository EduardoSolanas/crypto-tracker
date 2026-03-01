import React from 'react';
import { render, fireEvent, waitFor } from '@testing-library/react-native';
import HomeScreen from '../HomeScreen';

// Mock dependencies
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
    const { View } = require('react-native');
    return function MockCoinIcon() {
        return <View testID="coin-icon" />;
    };
});

describe('HomeScreen - Small Balances Toggle', () => {
    const mockPortfolio = [
        { symbol: 'BTC', quantity: 1, price: 50000, value: 50000, change24h: 2.5 },
        { symbol: 'ETH', quantity: 10, price: 3000, value: 30000, change24h: 1.5 },
        { symbol: 'XRP', quantity: 100, price: 0.5, value: 50, change24h: 0.5 },
        { symbol: 'DOGE', quantity: 1000, price: 0.005, value: 5, change24h: -0.5 },
        { symbol: 'ADA', quantity: 200, price: 0.03, value: 6, change24h: 0.8 },
    ];

    beforeEach(() => {
        jest.clearAllMocks();
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

    it('should only show assets >= $10 by default', async () => {
        const { queryByText, getByText } = render(<HomeScreen />);

        await waitFor(() => {
            expect(getByText('BTC')).toBeTruthy();
            expect(getByText('ETH')).toBeTruthy();
            expect(getByText('XRP')).toBeTruthy(); // $50
        });

        // Small balances should be hidden
        expect(queryByText('DOGE')).toBeNull(); // $5
        expect(queryByText('ADA')).toBeNull(); // $6
    });

    it('should show button to reveal hidden small balances', async () => {
        const { getByText } = render(<HomeScreen />);

        await waitFor(() => {
            expect(getByText(/Show 2 Small Balances/i)).toBeTruthy();
        });
    });

    it('should show all balances when toggle is clicked', async () => {
        const { getByText, queryByText } = render(<HomeScreen />);

        await waitFor(() => {
            expect(getByText(/Show 2 Small Balances/i)).toBeTruthy();
        });

        // Click the toggle button
        const toggleButton = getByText(/Show 2 Small Balances/i);
        fireEvent.press(toggleButton);

        await waitFor(() => {
            expect(getByText('DOGE')).toBeTruthy();
            expect(getByText('ADA')).toBeTruthy();
        });
    });

    it('should change button text to "Hide Small Balances" when expanded', async () => {
        const { getByText } = render(<HomeScreen />);

        await waitFor(() => {
            expect(getByText(/Show 2 Small Balances/i)).toBeTruthy();
        });

        // Click to expand
        const toggleButton = getByText(/Show 2 Small Balances/i);
        fireEvent.press(toggleButton);

        await waitFor(() => {
            expect(getByText('Hide Small Balances')).toBeTruthy();
        });
    });

    it('should hide small balances again when clicking "Hide Small Balances"', async () => {
        const { getByText, queryByText } = render(<HomeScreen />);

        await waitFor(() => {
            expect(getByText(/Show 2 Small Balances/i)).toBeTruthy();
        });

        // Expand
        fireEvent.press(getByText(/Show 2 Small Balances/i));

        await waitFor(() => {
            expect(getByText('DOGE')).toBeTruthy();
            expect(getByText('Hide Small Balances')).toBeTruthy();
        });

        // Collapse
        fireEvent.press(getByText('Hide Small Balances'));

        await waitFor(() => {
            expect(queryByText('DOGE')).toBeNull();
            expect(queryByText('ADA')).toBeNull();
            expect(getByText(/Show 2 Small Balances/i)).toBeTruthy();
        });
    });

    it('should still show toggle button when balances are expanded', async () => {
        const { getByText } = render(<HomeScreen />);

        await waitFor(() => {
            expect(getByText(/Show 2 Small Balances/i)).toBeTruthy();
        });

        // Expand
        fireEvent.press(getByText(/Show 2 Small Balances/i));

        await waitFor(() => {
            // Button should still exist, just with different text
            expect(getByText('Hide Small Balances')).toBeTruthy();
        });
    });

    it('should not show toggle button when there are no small balances', async () => {
        const db = require('../../db');
        const cryptoCompare = require('../../cryptoCompare');
        
        // Mock portfolio with no small balances
        const largePortfolio = [
            { symbol: 'BTC', quantity: 1, price: 50000, value: 50000, change24h: 2.5 },
            { symbol: 'ETH', quantity: 10, price: 3000, value: 30000, change24h: 1.5 },
        ];
        
        db.getHoldingsMap.mockResolvedValue({ BTC: 1, ETH: 10 });
        cryptoCompare.fetchPortfolioPrices.mockResolvedValue(largePortfolio);

        const { queryByText } = render(<HomeScreen />);

        await waitFor(() => {
            expect(queryByText(/Small Balances/i)).toBeNull();
        });
    });

    it('should correctly count hidden balances', async () => {
        const { getByText } = render(<HomeScreen />);

        await waitFor(() => {
            // 2 assets under $10 (DOGE: $5, ADA: $6)
            expect(getByText('Show 2 Small Balances')).toBeTruthy();
        });
    });

    it('should filter balances at exactly $10 threshold', async () => {
        const db = require('../../db');
        const cryptoCompare = require('../../cryptoCompare');
        
        const portfolioWithThreshold = [
            { symbol: 'BTC', quantity: 1, price: 50000, value: 50000, change24h: 2.5 },
            { symbol: 'EXACT', quantity: 10, price: 1, value: 10, change24h: 0 }, // Exactly $10
            { symbol: 'BELOW', quantity: 100, price: 0.09, value: 9, change24h: 0 }, // Just below $10
        ];
        
        db.getHoldingsMap.mockResolvedValue({ BTC: 1, EXACT: 10, BELOW: 100 });
        cryptoCompare.fetchPortfolioPrices.mockResolvedValue(portfolioWithThreshold);

        const { getByText, queryByText } = render(<HomeScreen />);

        await waitFor(() => {
            expect(getByText('BTC')).toBeTruthy();
            expect(getByText('EXACT')).toBeTruthy(); // >= $10 should show
            expect(queryByText('BELOW')).toBeNull(); // < $10 should hide
        });
    });

});

describe('HomeScreen graph ranges', () => {
    beforeEach(() => {
        jest.clearAllMocks();
        const db = require('../../db');
        const cryptoCompare = require('../../cryptoCompare');
        const history = require('../../utils/portfolioHistory');

        db.getHoldingsMap.mockResolvedValue({ BTC: 1 });
        db.getAllTransactions.mockResolvedValue([]);
        cryptoCompare.fetchPortfolioPrices.mockResolvedValue([
            { symbol: 'BTC', quantity: 1, price: 50000, value: 50000, change24h: 2.5 },
        ]);
        history.computePortfolioHistory.mockResolvedValue({
            chartData: [],
            delta: { val: 0, pct: 0 },
            chartColor: '#22c55e',
            coinDeltas: {},
        });
    });

    it('recomputes graph when switching to ALL range', async () => {
        const history = require('../../utils/portfolioHistory');
        const { getByText } = render(<HomeScreen />);

        await waitFor(() => {
            expect(history.computePortfolioHistory).toHaveBeenCalledWith(expect.objectContaining({ range: '1D' }));
        });

        fireEvent.press(getByText('ALL'));

        await waitFor(() => {
            expect(history.computePortfolioHistory).toHaveBeenCalledWith(expect.objectContaining({ range: 'ALL' }));
        });
    });
});
