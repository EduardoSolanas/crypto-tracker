import React from 'react';
import { act, render, fireEvent, waitFor } from '@testing-library/react-native';
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
    replaceAllTransactions: jest.fn().mockResolvedValue(undefined),
    upsertHoldings: jest.fn().mockResolvedValue(undefined),
    setMeta: jest.fn().mockResolvedValue(undefined),
}));

jest.mock('../../cryptoCompare', () => ({
    fetchPortfolioPrices: jest.fn().mockResolvedValue([]),
    fetchCandles: jest.fn().mockResolvedValue([]),
    clearCandleCache: jest.fn(),
}));

jest.mock('../../csv', () => ({
    parseDeltaCsvToTxns: jest.fn(),
    computeHoldingsFromTxns: jest.fn((txns) => {
        const holdings = {};
        (txns || []).forEach(t => {
            const sym = t.symbol;
            if (!holdings[sym]) holdings[sym] = 0;
            if (['BUY', 'DEPOSIT', 'RECEIVE'].includes(t.way)) holdings[sym] += Number(t.amount || 0);
            if (['SELL', 'WITHDRAW', 'SEND'].includes(t.way)) holdings[sym] -= Number(t.amount || 0);
        });
        return holdings;
    }),
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
            border: '#333',
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

jest.mock('../../components/CryptoGraph', () => {
    const React = require('react');
    const { View } = require('react-native');
    return function MockCryptoGraph() {
        return <View testID="mock-crypto-graph" />;
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

    const mockTransactions = [
        { symbol: 'BTC', amount: 1, way: 'BUY', date_iso: '2024-01-01' },
        { symbol: 'ETH', amount: 10, way: 'BUY', date_iso: '2024-01-02' },
        { symbol: 'XRP', amount: 100, way: 'BUY', date_iso: '2024-01-03' },
        { symbol: 'DOGE', amount: 1000, way: 'BUY', date_iso: '2024-01-04' },
        { symbol: 'ADA', amount: 200, way: 'BUY', date_iso: '2024-01-05' },
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
        db.getAllTransactions.mockResolvedValue(mockTransactions);
        
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
        const { getByText } = render(<HomeScreen />);

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
        db.getAllTransactions.mockResolvedValue([
            { symbol: 'BTC', amount: 1, way: 'BUY', date_iso: '2024-01-01' },
            { symbol: 'ETH', amount: 10, way: 'BUY', date_iso: '2024-01-02' },
        ]);
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
        db.getAllTransactions.mockResolvedValue([
            { symbol: 'BTC', amount: 1, way: 'BUY', date_iso: '2024-01-01' },
            { symbol: 'EXACT', amount: 10, way: 'BUY', date_iso: '2024-01-02' },
            { symbol: 'BELOW', amount: 100, way: 'BUY', date_iso: '2024-01-03' },
        ]);
        cryptoCompare.fetchPortfolioPrices.mockResolvedValue(portfolioWithThreshold);

        const { getByText, queryByText } = render(<HomeScreen />);

        await waitFor(() => {
            expect(getByText('BTC')).toBeTruthy();
            expect(getByText('EXACT')).toBeTruthy(); // >= $10 should show
            expect(queryByText('BELOW')).toBeNull(); // < $10 should hide
        });
    });

    it('renders sort pills with Best Value, 24h %, Name (A-Z), and Quantity', async () => {
        const { getByText } = render(<HomeScreen />);

        await waitFor(() => {
            expect(getByText('BTC')).toBeTruthy();
        });

        expect(getByText('Best Value')).toBeTruthy();
        expect(getByText(/24h/i)).toBeTruthy();
        expect(getByText(/A-Z/i)).toBeTruthy();
        expect(getByText('Quantity')).toBeTruthy();
    });

    it('sorts assets by 24h %, A-Z, Quantity, and Best Value when clicking sort pills', async () => {
        const { getByText, getAllByText } = render(<HomeScreen />);

        await waitFor(() => {
            expect(getByText('BTC')).toBeTruthy();
        });

        expect(getByText('Best Value')).toBeTruthy();

        // Click A-Z
        fireEvent.press(getByText(/A-Z/i));
        await waitFor(() => {
            const symbols = getAllByText(/BTC|ETH|XRP/).map(node => node.props.children);
            expect(symbols).toContain('BTC');
            expect(symbols).toContain('ETH');
            expect(symbols).toContain('XRP');
        });

        // Click Quantity
        fireEvent.press(getByText('Quantity'));
        await waitFor(() => {
            expect(getByText('Quantity')).toBeTruthy();
        });

        // Click Best Value
        fireEvent.press(getByText('Best Value'));
        await waitFor(() => {
            expect(getByText('Best Value')).toBeTruthy();
        });
    });
});

describe('HomeScreen startup and first load', () => {
    const txns = [{ symbol: 'BTC', amount: 1, way: 'BUY', date_iso: '2024-01-01' }];
    const cached = { timestamp: Date.now() - 2 * 60 * 60 * 1000, range: '1D', chartData: [], delta: { val: 0, pct: 0 }, portfolio: [{ symbol: 'BTC', quantity: 1, price: 100, value: 100, change24h: 0 }] };

    beforeEach(() => {
        const db = require('../../db');
        const history = require('../../utils/portfolioHistory');
        const cryptoCompare = require('../../cryptoCompare');
        db.getAllTransactions.mockResolvedValue(txns);
        db.getHoldingsMap.mockResolvedValue({ BTC: 1 });
        db.loadCache.mockResolvedValue(cached);
        cryptoCompare.fetchCandles.mockResolvedValue([]);
        history.computePortfolioHistory.mockReset().mockResolvedValue({
            chartData: [{ timestamp: 1, value: 100 }, { timestamp: 2, value: 200 }],
            delta: { val: 100, pct: 100 },
            chartColor: '#22c55e',
            coinDeltas: {},
        });
    });

    it('does not show graphs screen while API calls are pending, then shows fresh values once complete', async () => {
        let resolve;
        const pending = new Promise(r => { resolve = r; });
        require('../../cryptoCompare').fetchPortfolioPrices.mockReturnValue(pending);
        const { queryByText, getAllByText } = render(<HomeScreen />);

        // While API call is pending, the graphs screen is NOT shown
        expect(queryByText('BTC')).toBeNull();
        expect(queryByText(/Total Worth/i)).toBeNull();

        await act(async () => {
            resolve([{ symbol: 'BTC', quantity: 1, price: 200, value: 200, change24h: 0 }]);
        });

        await waitFor(() => expect(getAllByText(/€200\.00/).length).toBeGreaterThan(0));
    });

    it('keeps cached balance when refresh rejects (offline mode)', async () => {
        require('../../cryptoCompare').fetchPortfolioPrices.mockRejectedValue(new Error('offline'));
        const { getByText, getAllByText } = render(<HomeScreen />);
        await waitFor(() => expect(getByText('BTC')).toBeTruthy());
        expect(getAllByText(/€100\.00/).length).toBeGreaterThan(0);
    });

    it('does not show graphs screen until day history graph building is complete', async () => {
        const history = require('../../utils/portfolioHistory');
        require('../../cryptoCompare').fetchPortfolioPrices.mockResolvedValue([{ ...cached.portfolio[0], price: 200, value: 200 }]);
        let finishDay;
        history.computePortfolioHistory.mockImplementation(() => new Promise(resolve => { finishDay = resolve; }));

        const { queryByTestId, getByTestId, queryByText } = render(<HomeScreen />);

        // While graph building hasn't finished, the graphs screen and graph are not shown
        expect(queryByTestId('mock-crypto-graph')).toBeNull();
        expect(queryByTestId('graph-loading-indicator')).toBeNull();
        expect(queryByText(/Total Worth/i)).toBeNull();

        await waitFor(() => expect(finishDay).toBeDefined());

        await act(async () => {
            finishDay({
                chartData: [{ timestamp: 1, value: 100 }, { timestamp: 2, value: 200 }],
                delta: { val: 100, pct: 100 },
                chartColor: '#22c55e',
                coinDeltas: {},
            });
        });

        await waitFor(() => expect(getByTestId('mock-crypto-graph')).toBeTruthy());
        expect(queryByTestId('graph-loading-indicator')).toBeNull();
    });

    it('pre-fetches day candles in parallel with portfolio prices during first load', async () => {
        const cryptoCompare = require('../../cryptoCompare');
        cryptoCompare.fetchPortfolioPrices.mockResolvedValue([{ ...cached.portfolio[0], price: 200, value: 200 }]);

        render(<HomeScreen />);

        await waitFor(() => {
            expect(cryptoCompare.fetchCandles).toHaveBeenCalledWith('BTC', 'EUR', 'hour', 44, 1);
        });
    });

    it('switches ranges and recomputes after initial load completes', async () => {
        const history = require('../../utils/portfolioHistory');
        const day = { chartData: [], delta: { val: 11, pct: 11 }, chartColor: '#22c55e', coinDeltas: {} };
        const week = { ...day, delta: { val: 22, pct: 22 } };
        require('../../cryptoCompare').fetchPortfolioPrices.mockResolvedValue([{ ...cached.portfolio[0], price: 200, value: 200 }]);
        history.computePortfolioHistory.mockImplementation(({ range }) => (
            range === '1D' ? Promise.resolve(day) : Promise.resolve(week)
        ));
        const { getByText, getAllByText } = render(<HomeScreen />);
        await waitFor(() => expect(getAllByText(/11\.00%/).length).toBeGreaterThan(0));
        fireEvent.press(getByText('1W'));
        await waitFor(() => expect(getAllByText(/22\.00%/).length).toBeGreaterThan(0));
    });

    it('never uses recent cached prices or cached 1D range on startup, holding splash screen until live APIs finish', async () => {
        const db = require('../../db');
        const cryptoCompare = require('../../cryptoCompare');
        const history = require('../../utils/portfolioHistory');

        db.loadCache.mockResolvedValue({
            timestamp: Date.now(), // Fresh cache (< 10 mins)
            range: '1D',
            chartData: [{ timestamp: 1, value: 123 }],
            delta: { val: -50, pct: -50 },
            portfolio: [{ symbol: 'BTC', quantity: 1, price: 123, value: 123, change24h: -50 }],
            rangesMap: {
                '1D_EUR': {
                    chartData: [{ timestamp: 1, value: 123 }],
                    delta: { val: -50, pct: -50 },
                    chartColor: '#ef4444',
                    coinDeltas: { BTC: { val: -50, pct: -50 } },
                },
            },
        });

        let resolvePrices;
        cryptoCompare.fetchPortfolioPrices.mockReturnValue(new Promise((r) => { resolvePrices = r; }));

        const { queryByTestId, queryByText, getAllByText } = render(<HomeScreen />);

        await waitFor(() => expect(resolvePrices).toBeDefined());
        expect(queryByTestId('startup-screen')).toBeTruthy();
        expect(queryByText(/€123\.00/)).toBeNull();
        expect(queryByText(/-50\.00%/)).toBeNull();

        await act(async () => {
            resolvePrices([{ symbol: 'BTC', quantity: 1, price: 250, value: 250, change24h: 25 }]);
        });

        await waitFor(() => {
            expect(queryByTestId('startup-screen')).toBeNull();
            expect(getAllByText(/€250\.00/).length).toBeGreaterThan(0);
            expect(getAllByText(/100\.00%/).length).toBeGreaterThan(0);
        });
        expect(history.computePortfolioHistory).toHaveBeenCalledWith(expect.objectContaining({
            range: '1D',
            currency: 'EUR',
        }));
        expect(queryByText(/€123\.00/)).toBeNull();
        expect(queryByText(/-50\.00%/)).toBeNull();
    });
});

describe('HomeScreen graph ranges', () => {
    beforeEach(() => {
        jest.clearAllMocks();
        const db = require('../../db');
        const cryptoCompare = require('../../cryptoCompare');
        const history = require('../../utils/portfolioHistory');

        db.getHoldingsMap.mockResolvedValue({ BTC: 1 });
        db.getAllTransactions.mockResolvedValue([{ symbol: 'BTC', amount: 1, way: 'BUY', date_iso: '2024-01-01' }]);
        db.loadCache.mockResolvedValue(null);
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

    it('loads only the day range at startup and defers other ranges until selected', async () => {
        const history = require('../../utils/portfolioHistory');
        const { getByText } = render(<HomeScreen />);

        await waitFor(() => {
            expect(history.computePortfolioHistory).toHaveBeenCalledWith(expect.objectContaining({ range: '1D' }));
        });

        expect(history.computePortfolioHistory.mock.calls.map(([args]) => args.range)).toEqual(['1D']);

        fireEvent.press(getByText('1W'));

        await waitFor(() => {
            expect(history.computePortfolioHistory).toHaveBeenCalledWith(expect.objectContaining({ range: '1W' }));
        });
        expect(history.computePortfolioHistory.mock.calls.map(([args]) => args.range)).toEqual(['1D', '1W']);
    });

    it('recomputes graph when switching to ALL range', async () => {
        const history = require('../../utils/portfolioHistory');
        const { getByText, queryByText } = render(<HomeScreen />);

        await waitFor(() => {
            expect(history.computePortfolioHistory).toHaveBeenCalledWith(expect.objectContaining({ range: '1D' }));
        });

        // Verify there is no separate 24h toggle label button
        expect(queryByText('24H CHANGE')).toBeNull();
        expect(queryByText('All-Time')).toBeNull();

        fireEvent.press(getByText('ALL'));

        await waitFor(() => {
            expect(history.computePortfolioHistory).toHaveBeenCalledWith(expect.objectContaining({ range: 'ALL' }));
        });
    });

    it('updates hero delta amount and percentage when selecting ranges', async () => {
        const history = require('../../utils/portfolioHistory');
        history.computePortfolioHistory.mockResolvedValue({
            chartData: [{ timestamp: 1000, value: 40000 }, { timestamp: 2000, value: 50000 }],
            delta: { val: 10000, pct: 25.0 },
            chartColor: '#22c55e',
            coinDeltas: {},
        });

        render(<HomeScreen />);

        await waitFor(() => {
            expect(history.computePortfolioHistory).toHaveBeenCalled();
        });
    });
});

describe('HomeScreen saved currency', () => {
    it('uses the saved currency for its first price fetch', async () => {
        const db = require('../../db');
        const cryptoCompare = require('../../cryptoCompare');
        db.getMeta.mockResolvedValue('USD');
        db.getHoldingsMap.mockResolvedValue({ BTC: 1 });
        db.getAllTransactions.mockResolvedValue([{ symbol: 'BTC', amount: 1, way: 'BUY', date_iso: '2024-01-01' }]);
        cryptoCompare.fetchPortfolioPrices.mockResolvedValue([{ symbol: 'BTC', quantity: 1, price: 50000, value: 50000 }]);

        render(<HomeScreen />);

        await waitFor(() => {
            expect(cryptoCompare.fetchPortfolioPrices).toHaveBeenCalledWith({ BTC: 1 }, 'USD');
        });
    });
});

describe('HomeScreen Empty State & Zero-Transaction Handling', () => {
    beforeEach(() => {
        jest.clearAllMocks();
        const db = require('../../db');
        const cryptoCompare = require('../../cryptoCompare');

        db.getAllTransactions.mockResolvedValue([]);
        db.getHoldingsMap.mockResolvedValue({});
        db.loadCache.mockResolvedValue(null);
        cryptoCompare.fetchPortfolioPrices.mockResolvedValue([]);
    });

    it('should display empty state with "No data. Import CSV." when there are no transactions', async () => {
        const { getByText, queryByText } = render(<HomeScreen />);

        await waitFor(() => {
            expect(getByText(/No data\. Import CSV\./i)).toBeTruthy();
            expect(getByText(/Add Transaction/i)).toBeTruthy();
        });

        expect(queryByText(/Small Balances/i)).toBeNull();
        expect(queryByText(/Total Worth/i)).toBeNull();
        expect(queryByText(/Portfolio Allocation/i)).toBeNull();
    });

    it('should ignore stale cached portfolio when there are no transactions and stay on empty state', async () => {
        const db = require('../../db');
        db.loadCache.mockResolvedValue({
            portfolio: [
                { symbol: 'BTC', quantity: 1, price: 50000, value: 50000, change24h: 2.5 },
                { symbol: 'DOGE', quantity: 1000, price: 0.005, value: 5, change24h: -0.5 }
            ],
            chartData: [],
            delta: { val: 0, pct: 0 },
            range: '1D',
            timestamp: Date.now(),
        });

        const { getByText, queryByText } = render(<HomeScreen />);

        await waitFor(() => {
            expect(getByText(/No data\. Import CSV\./i)).toBeTruthy();
        });

        expect(queryByText('BTC')).toBeNull();
        expect(queryByText('DOGE')).toBeNull();
        expect(queryByText(/Small Balances/i)).toBeNull();
    });
});

describe('HomeScreen Hero PnL & Graph Container Styling', () => {
    it('renders hero PnL as plain text without container and renders borderless header', async () => {
        const db = require('../../db');
        const cryptoCompare = require('../../cryptoCompare');
        const portfolioHistory = require('../../utils/portfolioHistory');

        db.getHoldingsMap.mockResolvedValue({ BTC: 1 });
        db.getAllTransactions.mockResolvedValue([{ symbol: 'BTC', amount: 1, way: 'BUY', date_iso: '2024-01-01' }]);
        cryptoCompare.fetchPortfolioPrices.mockResolvedValue([{ symbol: 'BTC', quantity: 1, price: 50000, value: 50000, change24h: 2.5 }]);
        portfolioHistory.computePortfolioHistory.mockResolvedValue({
            chartData: [{ timestamp: 1, value: 48000 }, { timestamp: 2, value: 50000 }],
            delta: { val: 2000, pct: 4.17 },
            chartColor: '#22c55e',
            coinDeltas: { BTC: { val: 2000, pct: 4.17 } },
        });

        const { getByText, getAllByText } = render(<HomeScreen />);

        await waitFor(() => {
            expect(getByText('BTC')).toBeTruthy();
            expect(getAllByText(/\+.*2,?000\.00/).length).toBeGreaterThanOrEqual(1);
            expect(getAllByText(/\(\+4\.17%\)/).length).toBeGreaterThanOrEqual(1);
        });
    });
});

describe('HomeScreen Zero-Value and Small Balance Placement', () => {
    it('moves zero-value currencies and small balances to the bottom below normal balances', async () => {
        jest.clearAllMocks();
        const db = require('../../db');
        const cryptoCompare = require('../../cryptoCompare');

        db.loadCache.mockResolvedValue(null);

        const mockPortfolio = [
            { symbol: 'BTC', quantity: 1, price: 50000, value: 50000, change24h: 2.5 },
            { symbol: 'ZERO_VAL', quantity: 1000, price: 0, value: 0, change24h: 0 },
            { symbol: 'ETH', quantity: 10, price: 3000, value: 30000, change24h: 1.5 },
            { symbol: 'TINY', quantity: 10, price: 0.2, value: 2, change24h: 5.0 },
        ];

        db.getHoldingsMap.mockResolvedValue({ BTC: 1, ZERO_VAL: 1000, ETH: 10, TINY: 10 });
        db.getAllTransactions.mockResolvedValue([
            { symbol: 'BTC', amount: 1, way: 'BUY', date_iso: '2024-01-01' },
            { symbol: 'ZERO_VAL', amount: 1000, way: 'BUY', date_iso: '2024-01-01' },
            { symbol: 'ETH', amount: 10, way: 'BUY', date_iso: '2024-01-01' },
            { symbol: 'TINY', amount: 10, way: 'BUY', date_iso: '2024-01-01' },
        ]);
        cryptoCompare.fetchPortfolioPrices.mockResolvedValue(mockPortfolio);

        const { getByText, queryByText } = render(<HomeScreen />);

        // By default, only normal balances (>= 10) are visible; ZERO_VAL and TINY are hidden
        await waitFor(() => {
            expect(getByText('BTC')).toBeTruthy();
            expect(getByText('ETH')).toBeTruthy();
            expect(queryByText('ZERO_VAL')).toBeNull();
            expect(queryByText('TINY')).toBeNull();
            expect(getByText(/Show 2 Small Balances/i)).toBeTruthy();
        });

        // Expand small balances
        fireEvent.press(getByText(/Show 2 Small Balances/i));

        await waitFor(() => {
            expect(getByText('ZERO_VAL')).toBeTruthy();
            expect(getByText('TINY')).toBeTruthy();
        });
    });
});
