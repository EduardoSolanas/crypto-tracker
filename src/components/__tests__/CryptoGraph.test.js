import { render } from '@testing-library/react-native';

jest.mock('react-native-wagmi-charts', () => {
    const React = require('react');
    const { View, Text } = require('react-native');

    const MockView = ({ children, pointerEvents, ...props }) => 
        React.createElement(View, { ...props, pointerEvents }, children);
    const MockText = ({ style, children }) => React.createElement(Text, { style }, children);

    function LineChartComponent({ children }) {
        return React.createElement(View, { testID: 'line-chart' }, children);
    }
    LineChartComponent.Provider = MockView;
    LineChartComponent.Path = () => null;
    LineChartComponent.CursorCrosshair = () => React.createElement(View, { testID: 'cursor-crosshair' });
    LineChartComponent.PriceText = () => React.createElement(Text, { testID: 'price-text' }, 'Price');

    function CandlestickChartComponent({ children }) {
        return React.createElement(View, { testID: 'candlestick-chart' }, children);
    }
    CandlestickChartComponent.Provider = MockView;
    CandlestickChartComponent.Candles = () => null;
    CandlestickChartComponent.Crosshair = () => React.createElement(View, { testID: 'crosshair' });
    CandlestickChartComponent.PriceText = () => React.createElement(Text, { testID: 'candle-price-text' }, 'Price');
    CandlestickChartComponent.DatetimeText = () => React.createElement(Text, { testID: 'datetime-text' }, 'Date');

    return {
        LineChart: LineChartComponent,
        CandlestickChart: CandlestickChartComponent,
    };
});

import CryptoGraph from '../CryptoGraph';

describe('CryptoGraph', () => {
    describe('Basic Rendering', () => {
        it('renders null when no data is provided', () => {
            const { queryByTestId } = render(<CryptoGraph data={[]} />);
            expect(queryByTestId('line-chart')).toBeNull();
        });

        it('renders null when data is undefined', () => {
            const { queryByTestId } = render(<CryptoGraph data={undefined} />);
            expect(queryByTestId('line-chart')).toBeNull();
        });
    });

    describe('Interaction Disabled', () => {
        it('line chart has pointerEvents="none" to disable touch interactions', () => {
            const mockData = [
                { timestamp: Date.now() - 86400000, value: 50000 },
                { timestamp: Date.now(), value: 52000 }
            ];

            const { UNSAFE_root } = render(
                <CryptoGraph type="line" data={mockData} currency="USD" />
            );

            // Find the root View that wraps the chart
            const rootView = UNSAFE_root.findByProps({ pointerEvents: 'none' });
            expect(rootView).toBeTruthy();
        });

        it('line chart does not render CursorCrosshair component', () => {
            const mockData = [
                { timestamp: Date.now() - 86400000, value: 50000 },
                { timestamp: Date.now(), value: 52000 }
            ];

            const { queryByTestId } = render(
                <CryptoGraph type="line" data={mockData} currency="USD" />
            );

            // CursorCrosshair should not be rendered
            expect(queryByTestId('cursor-crosshair')).toBeNull();
        });

        it('line chart does not render PriceText component', () => {
            const mockData = [
                { timestamp: Date.now() - 86400000, value: 50000 },
                { timestamp: Date.now(), value: 52000 }
            ];

            const { queryByTestId } = render(
                <CryptoGraph type="line" data={mockData} currency="USD" />
            );

            // PriceText should not be rendered
            expect(queryByTestId('price-text')).toBeNull();
        });

        it('line chart shows only top and bottom Y-axis labels', () => {
            const mockData = [
                { timestamp: Date.now() - 86400000, value: 50000 },
                { timestamp: Date.now(), value: 52000 }
            ];

            const { queryAllByTestId } = render(
                <CryptoGraph type="line" data={mockData} currency="USD" />
            );

            expect(queryAllByTestId('graph-y-max')).toHaveLength(1);
            expect(queryAllByTestId('graph-y-min')).toHaveLength(1);
        });

        it('candlestick chart has pointerEvents="none" to disable touch interactions', () => {
            const mockData = [
                { timestamp: Date.now() - 86400000, open: 48000, high: 52000, low: 47000, close: 51000 },
                { timestamp: Date.now(), open: 51000, high: 53000, low: 50000, close: 52500 }
            ];

            const { UNSAFE_root } = render(
                <CryptoGraph type="candle" data={mockData} currency="USD" />
            );

            // Find the root View that wraps the chart
            const rootView = UNSAFE_root.findByProps({ pointerEvents: 'none' });
            expect(rootView).toBeTruthy();
        });

        it('candlestick chart does not render Crosshair component', () => {
            const mockData = [
                { timestamp: Date.now() - 86400000, open: 48000, high: 52000, low: 47000, close: 51000 },
                { timestamp: Date.now(), open: 51000, high: 53000, low: 50000, close: 52500 }
            ];

            const { queryByTestId } = render(
                <CryptoGraph type="candle" data={mockData} currency="USD" />
            );

            // Crosshair should not be rendered
            expect(queryByTestId('crosshair')).toBeNull();
        });

        it('candlestick chart does not render interactive PriceText and DatetimeText', () => {
            const mockData = [
                { timestamp: Date.now() - 86400000, open: 48000, high: 52000, low: 47000, close: 51000 },
                { timestamp: Date.now(), open: 51000, high: 53000, low: 50000, close: 52500 }
            ];

            const { queryByTestId } = render(
                <CryptoGraph type="candle" data={mockData} currency="USD" />
            );

            // Interactive elements should not be rendered
            expect(queryByTestId('candle-price-text')).toBeNull();
            expect(queryByTestId('datetime-text')).toBeNull();
        });
    });

    describe('Line Chart - Portfolio View', () => {
        describe('1H View - Minute-level data', () => {
            it('plots upward trend correctly', () => {
                const mockData = Array.from({ length: 60 }, (_, i) => ({
                    timestamp: Date.now() - (60 - i) * 60000,
                    value: 10000 + i * 100 // Steady increase
                }));

                const { getByText, getByTestId } = render(
                    <CryptoGraph type="line" data={mockData} currency="USD" />
                );

                expect(getByTestId('line-chart')).toBeTruthy();
                // Check min and max are displayed
                expect(getByText(/\$10,000/)).toBeTruthy(); // Min value
                expect(getByText(/\$15,900/)).toBeTruthy(); // Max value (59 * 100 + 10000)
            });

            it('plots downward trend correctly', () => {
                const mockData = Array.from({ length: 60 }, (_, i) => ({
                    timestamp: Date.now() - (60 - i) * 60000,
                    value: 20000 - i * 100 // Steady decrease
                }));

                const { getByText, getByTestId } = render(
                    <CryptoGraph type="line" data={mockData} currency="EUR" />
                );

                expect(getByTestId('line-chart')).toBeTruthy();
                expect(getByText(/€20,000/)).toBeTruthy(); // Max
                expect(getByText(/€14,100/)).toBeTruthy(); // Min (20000 - 59*100)
            });

            it('plots volatile intraday movements', () => {
                const mockData = [
                    { timestamp: Date.now() - 3600000, value: 50000 },
                    { timestamp: Date.now() - 2700000, value: 51000 },
                    { timestamp: Date.now() - 1800000, value: 49500 },
                    { timestamp: Date.now() - 900000, value: 52000 },
                    { timestamp: Date.now(), value: 50500 }
                ];

                const { getByText } = render(
                    <CryptoGraph type="line" data={mockData} currency="USD" />
                );

                expect(getByText(/\$52,000/)).toBeTruthy(); // Peak
                expect(getByText(/\$49,500/)).toBeTruthy(); // Trough
            });
        });

        describe('1D View - 24-hour data', () => {
            it('plots daily price action with multiple data points', () => {
                const mockData = Array.from({ length: 24 }, (_, i) => ({
                    timestamp: Date.now() - (24 - i) * 3600000,
                    value: 30000 + Math.sin(i / 4) * 2000 // Wave pattern
                }));

                const { getByText, getByTestId } = render(
                    <CryptoGraph type="line" data={mockData} currency="GBP" />
                );

                expect(getByTestId('line-chart')).toBeTruthy();
                // Should show max and min from the wave
                // Just verify chart renders with wave data
                expect(getByTestId('line-chart')).toBeTruthy();
            });

            it('plots flat market (no movement)', () => {
                const mockData = Array.from({ length: 24 }, (_, i) => ({
                    timestamp: Date.now() - (24 - i) * 3600000,
                    value: 45000 // Constant
                }));

                const { getByTestId } = render(
                    <CryptoGraph type="line" data={mockData} currency="USD" />
                );

                expect(getByTestId('line-chart')).toBeTruthy();
            });

            it('plots recovery pattern (V-shape)', () => {
                const mockData = [
                    { timestamp: Date.now() - 86400000, value: 40000 },
                    { timestamp: Date.now() - 64800000, value: 38000 },
                    { timestamp: Date.now() - 43200000, value: 35000 }, // Bottom
                    { timestamp: Date.now() - 21600000, value: 38000 },
                    { timestamp: Date.now(), value: 41000 }
                ];

                const { getByTestId } = render(
                    <CryptoGraph type="line" data={mockData} currency="EUR" />
                );

                expect(getByTestId('line-chart')).toBeTruthy();
            });
        });

        describe('1W View - Weekly trends', () => {
            it('plots steady weekly growth', () => {
                const mockData = Array.from({ length: 7 }, (_, i) => ({
                    timestamp: Date.now() - (7 - i) * 86400000,
                    value: 25000 + i * 1000
                }));

                const { getByText } = render(
                    <CryptoGraph type="line" data={mockData} currency="USD" />
                );

                expect(getByText(/\$31,000/)).toBeTruthy(); // End
                expect(getByText(/\$25,000/)).toBeTruthy(); // Start
            });

            it('plots weekly consolidation (range-bound)', () => {
                const mockData = Array.from({ length: 7 }, (_, i) => ({
                    timestamp: Date.now() - (7 - i) * 86400000,
                    value: 48000 + (i % 2 === 0 ? 500 : -500) // Oscillating
                }));

                const { getByText } = render(
                    <CryptoGraph type="line" data={mockData} currency="EUR" />
                );

                expect(getByText(/€48,500/)).toBeTruthy();
                expect(getByText(/€47,500/)).toBeTruthy();
            });

            it('plots weekend pump pattern', () => {
                const mockData = [
                    { timestamp: Date.now() - 7 * 86400000, value: 30000 },
                    { timestamp: Date.now() - 5 * 86400000, value: 30500 },
                    { timestamp: Date.now() - 3 * 86400000, value: 31000 },
                    { timestamp: Date.now() - 2 * 86400000, value: 35000 }, // Weekend spike
                    { timestamp: Date.now(), value: 32000 }
                ];

                const { getByText } = render(
                    <CryptoGraph type="line" data={mockData} currency="GBP" />
                );

                expect(getByText(/£35,000/)).toBeTruthy(); // Peak
                expect(getByText(/£30,000/)).toBeTruthy(); // Base
            });
        });

        describe('1M View - Monthly trends', () => {
            it('plots bull market (consistent growth)', () => {
                const mockData = Array.from({ length: 30 }, (_, i) => ({
                    timestamp: Date.now() - (30 - i) * 86400000,
                    value: 20000 + i * 500
                }));

                const { getByText } = render(
                    <CryptoGraph type="line" data={mockData} currency="USD" />
                );

                expect(getByText(/\$34,500/)).toBeTruthy(); // Month end
                expect(getByText(/\$20,000/)).toBeTruthy(); // Month start
            });

            it('plots bear market (consistent decline)', () => {
                const mockData = Array.from({ length: 30 }, (_, i) => ({
                    timestamp: Date.now() - (30 - i) * 86400000,
                    value: 60000 - i * 800
                }));

                const { getByText } = render(
                    <CryptoGraph type="line" data={mockData} currency="EUR" />
                );

                expect(getByText(/€60,000/)).toBeTruthy(); // Start high
                expect(getByText(/€36,800/)).toBeTruthy(); // End low
            });

            it('plots mid-month correction', () => {
                const mockData = [
                    { timestamp: Date.now() - 30 * 86400000, value: 40000 },
                    { timestamp: Date.now() - 22 * 86400000, value: 45000 },
                    { timestamp: Date.now() - 15 * 86400000, value: 38000 }, // Correction
                    { timestamp: Date.now() - 8 * 86400000, value: 42000 },
                    { timestamp: Date.now(), value: 46000 }
                ];

                const { getByText } = render(
                    <CryptoGraph type="line" data={mockData} currency="USD" />
                );

                expect(getByText(/\$46,000/)).toBeTruthy();
                expect(getByText(/\$38,000/)).toBeTruthy();
            });
        });

        describe('1Y View - Yearly trends', () => {
            it('plots parabolic growth', () => {
                const mockData = Array.from({ length: 12 }, (_, i) => ({
                    timestamp: Date.now() - (12 - i) * 30 * 86400000,
                    value: 10000 * Math.pow(1.15, i) // 15% monthly growth
                }));

                const { getByTestId } = render(
                    <CryptoGraph type="line" data={mockData} currency="USD" />
                );

                // Verify chart renders with parabolic data
                expect(getByTestId('line-chart')).toBeTruthy();
            });

            it('plots multi-cycle year (boom-bust-recovery)', () => {
                const mockData = [
                    { timestamp: Date.now() - 365 * 86400000, value: 20000 },
                    { timestamp: Date.now() - 270 * 86400000, value: 60000 }, // Boom
                    { timestamp: Date.now() - 180 * 86400000, value: 25000 }, // Bust
                    { timestamp: Date.now() - 90 * 86400000, value: 35000 },
                    { timestamp: Date.now(), value: 50000 } // Recovery
                ];

                const { getByText } = render(
                    <CryptoGraph type="line" data={mockData} currency="EUR" />
                );

                expect(getByText(/€60,000/)).toBeTruthy(); // Peak
                expect(getByText(/€20,000/)).toBeTruthy(); // Start
            });

            it('plots sideways accumulation year', () => {
                const mockData = Array.from({ length: 12 }, (_, i) => ({
                    timestamp: Date.now() - (12 - i) * 30 * 86400000,
                    value: 35000 + (Math.random() - 0.5) * 3000 // Random walk
                }));

                const { getByTestId } = render(
                    <CryptoGraph type="line" data={mockData} currency="GBP" />
                );

                expect(getByTestId('line-chart')).toBeTruthy();
            });
        });

        describe('ALL View - Full history', () => {
            it('plots multi-year exponential growth', () => {
                const mockData = Array.from({ length: 50 }, (_, i) => ({
                    timestamp: Date.now() - (50 - i) * 30 * 86400000,
                    value: 1000 * Math.pow(1.1, i) // 10% monthly
                }));

                const { getByTestId } = render(
                    <CryptoGraph type="line" data={mockData} currency="USD" />
                );

                // Verify chart renders with exponential data
                expect(getByTestId('line-chart')).toBeTruthy();
            });

            it('plots full market cycle (multiple years)', () => {
                const mockData = [
                    { timestamp: Date.now() - 1000 * 86400000, value: 5000 },
                    { timestamp: Date.now() - 800 * 86400000, value: 20000 },
                    { timestamp: Date.now() - 600 * 86400000, value: 8000 },
                    { timestamp: Date.now() - 400 * 86400000, value: 35000 },
                    { timestamp: Date.now() - 200 * 86400000, value: 15000 },
                    { timestamp: Date.now(), value: 50000 }
                ];

                const { getByText } = render(
                    <CryptoGraph type="line" data={mockData} currency="EUR" />
                );

                expect(getByText(/€50,000/)).toBeTruthy();
                expect(getByText(/€5,000/)).toBeTruthy();
            });

            it('plots early adoption to mainstream (hockey stick)', () => {
                const mockData = [
                    ...Array.from({ length: 30 }, (_, i) => ({
                        timestamp: Date.now() - (40 - i) * 30 * 86400000,
                        value: 100 + i * 50 // Slow growth
                    })),
                    ...Array.from({ length: 10 }, (_, i) => ({
                        timestamp: Date.now() - (10 - i) * 30 * 86400000,
                        value: 1600 + i * 3000 // Explosive growth
                    }))
                ];

                const { getByText } = render(
                    <CryptoGraph type="line" data={mockData} currency="USD" />
                );

                expect(getByText(/\$28,600/)).toBeTruthy(); // Recent high
                expect(getByText(/\$100/)).toBeTruthy(); // Early days
            });
        });

        describe('Edge Cases', () => {
            it('handles single data point', () => {
                const mockData = [{ timestamp: Date.now(), value: 42000 }];

                const { getByTestId } = render(
                    <CryptoGraph type="line" data={mockData} currency="USD" />
                );

                expect(getByTestId('line-chart')).toBeTruthy();
            });

            it('handles two data points (minimal line)', () => {
                const mockData = [
                    { timestamp: Date.now() - 86400000, value: 30000 },
                    { timestamp: Date.now(), value: 32000 }
                ];

                const { getByText } = render(
                    <CryptoGraph type="line" data={mockData} currency="EUR" />
                );

                expect(getByText(/€32,000/)).toBeTruthy();
                expect(getByText(/€30,000/)).toBeTruthy();
            });

            it('handles very small values (satoshis)', () => {
                const mockData = [
                    { timestamp: Date.now() - 86400000, value: 0.00001 },
                    { timestamp: Date.now(), value: 0.00002 }
                ];

                const { getByTestId } = render(
                    <CryptoGraph type="line" data={mockData} currency="USD" />
                );

                expect(getByTestId('line-chart')).toBeTruthy();
            });

            it('handles very large values (billions)', () => {
                const mockData = [
                    { timestamp: Date.now() - 86400000, value: 1000000000 },
                    { timestamp: Date.now(), value: 1500000000 }
                ];

                const { getByTestId } = render(
                    <CryptoGraph type="line" data={mockData} currency="USD" />
                );

                expect(getByTestId('line-chart')).toBeTruthy();
            });
        });
    });

    describe('Candlestick Chart - Coin Detail View', () => {
        it('renders candle chart with OHLC data', () => {
            const mockData = [
                { timestamp: Date.now() - 86400000, open: 48000, high: 52000, low: 47000, close: 51000 },
                { timestamp: Date.now(), open: 51000, high: 53000, low: 50000, close: 52500 }
            ];

            const { getByText, getByTestId } = render(
                <CryptoGraph type="candle" data={mockData} currency="USD" />
            );

            expect(getByTestId('candlestick-chart')).toBeTruthy();
            expect(getByText(/\$53,000/)).toBeTruthy(); // Highest high
            expect(getByText(/\$47,000/)).toBeTruthy(); // Lowest low
        });

        it('plots bullish candles (green)', () => {
            const mockData = Array.from({ length: 5 }, (_, i) => ({
                timestamp: Date.now() - (5 - i) * 86400000,
                open: 40000 + i * 1000,
                close: 41000 + i * 1000, // Close > Open
                high: 42000 + i * 1000,
                low: 39500 + i * 1000
            }));

            const { getByTestId } = render(
                <CryptoGraph type="candle" data={mockData} currency="EUR" />
            );

            expect(getByTestId('candlestick-chart')).toBeTruthy();
        });

        it('plots bearish candles (red)', () => {
            const mockData = Array.from({ length: 5 }, (_, i) => ({
                timestamp: Date.now() - (5 - i) * 86400000,
                open: 50000 - i * 1000,
                close: 49000 - i * 1000, // Close < Open
                high: 50500 - i * 1000,
                low: 48500 - i * 1000
            }));

            const { getByTestId } = render(
                <CryptoGraph type="candle" data={mockData} currency="USD" />
            );

            expect(getByTestId('candlestick-chart')).toBeTruthy();
        });

        it('plots mixed candles (consolidation)', () => {
            const mockData = [
                { timestamp: Date.now() - 4 * 86400000, open: 45000, close: 46000, high: 47000, low: 44500 },
                { timestamp: Date.now() - 3 * 86400000, open: 46000, close: 45500, high: 46500, low: 45000 },
                { timestamp: Date.now() - 2 * 86400000, open: 45500, close: 46200, high: 46800, low: 45200 },
                { timestamp: Date.now() - 1 * 86400000, open: 46200, close: 45800, high: 46500, low: 45500 },
                { timestamp: Date.now(), open: 45800, close: 46100, high: 46400, low: 45600 }
            ];

            const { getByText } = render(
                <CryptoGraph type="candle" data={mockData} currency="GBP" />
            );

            expect(getByText(/£47,000/)).toBeTruthy(); // Highest
            expect(getByText(/£44,500/)).toBeTruthy(); // Lowest
        });
    });
});
