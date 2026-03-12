import React from 'react';
import { fireEvent, render, waitFor } from '@testing-library/react-native';
import CoinScreen from '../CoinScreen';

const mockUseLocalSearchParams = jest.fn();
const mockFetchCandles = jest.fn();

jest.mock('expo-router', () => ({
    router: {
        push: jest.fn(),
        back: jest.fn(),
    },
    useLocalSearchParams: () => mockUseLocalSearchParams(),
}));

jest.mock('../../cryptoCompare', () => ({
    fetchPortfolioPrices: jest.fn(async () => ([
        {
            symbol: 'BTC',
            quantity: 1,
            price: 50000,
            value: 50000,
            change24h: 2.5,
            imageUrl: null,
        },
    ])),
    fetchCandles: (...args) => mockFetchCandles(...args),
    fetchFxRates: jest.fn(async () => ({ EUR: 1, USD: 0.9 })),
}));

jest.mock('../../db', () => ({
    getMeta: jest.fn(async () => 'EUR'),
    getHoldingsMap: jest.fn(async () => ({ BTC: 1, ETH: 1 })),
    listTransactionsBySymbol: jest.fn(async () => []),
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
            border: '#333',
        },
    }),
}));

jest.mock('../../components/CoinIcon', () => {
    const React = require('react');
    const { View } = require('react-native');
    return function MockCoinIcon() {
        return <View testID="coin-icon" />;
    };
});

jest.mock('react-native-wagmi-charts', () => {
    const React = require('react');
    const { View } = require('react-native');

    function LineChartComponent({ children }) {
        return React.createElement(View, { testID: 'line-chart' }, children);
    }
    LineChartComponent.Provider = ({ children }) => React.createElement(View, null, children);
    LineChartComponent.Path = () => null;

    function CandlestickChartComponent({ children }) {
        return React.createElement(View, { testID: 'candlestick-chart' }, children);
    }
    CandlestickChartComponent.Provider = ({ children }) => React.createElement(View, null, children);
    CandlestickChartComponent.Candles = () => null;

    return {
        LineChart: LineChartComponent,
        CandlestickChart: CandlestickChartComponent,
    };
});

describe('CoinScreen graph ranges', () => {
    beforeEach(() => {
        jest.clearAllMocks();
        mockFetchCandles.mockResolvedValue([
            {
                time: Math.floor(Date.now() / 1000) - 3600,
                open: 49500,
                high: 50500,
                low: 49000,
                close: 50000,
            },
            {
                time: Math.floor(Date.now() / 1000),
                open: 50000,
                high: 51000,
                low: 49800,
                close: 50800,
            },
        ]);
    });

    it('uses ALL mode params for per-coin graph', async () => {
        mockUseLocalSearchParams.mockReturnValue({ symbol: 'BTC' });

        const { getByText } = render(<CoinScreen />);

        await waitFor(() => {
            expect(mockFetchCandles).toHaveBeenCalledWith('BTC', 'EUR', 'minute', 120, 12);
        });

        fireEvent.press(getByText('ALL'));

        await waitFor(() => {
            expect(mockFetchCandles).toHaveBeenCalledWith('BTC', 'EUR', 'day', 200, 5);
        });
    });

    it('accepts legacy id param as symbol fallback', async () => {
        mockUseLocalSearchParams.mockReturnValue({ id: 'ETH' });

        render(<CoinScreen />);

        await waitFor(() => {
            expect(mockFetchCandles).toHaveBeenCalledWith('ETH', 'EUR', 'minute', 120, 12);
        });
    });

    it('recomputes graph when switching ranges', async () => {
        mockUseLocalSearchParams.mockReturnValue({ symbol: 'BTC' });

        const { getByText } = render(<CoinScreen />);

        await waitFor(() => {
            expect(mockFetchCandles).toHaveBeenCalledWith('BTC', 'EUR', 'minute', 120, 12);
        });

        fireEvent.press(getByText('1W'));

        await waitFor(() => {
            expect(mockFetchCandles).toHaveBeenCalledWith('BTC', 'EUR', 'hour', 84, 2);
        });
    });

    it('recomputes graph when switching to ALL range', async () => {
        mockUseLocalSearchParams.mockReturnValue({ symbol: 'BTC' });

        const { getByText } = render(<CoinScreen />);

        await waitFor(() => {
            expect(mockFetchCandles).toHaveBeenCalledWith('BTC', 'EUR', 'minute', 120, 12);
        });

        fireEvent.press(getByText('ALL'));

        await waitFor(() => {
            expect(mockFetchCandles).toHaveBeenCalledWith('BTC', 'EUR', 'day', 200, 5);
        });
    });
});
