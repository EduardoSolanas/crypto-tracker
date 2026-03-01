import { Dimensions, Text, View } from 'react-native';
import { CandlestickChart, LineChart } from 'react-native-wagmi-charts';
import { downsampleCandleData, downsampleLineData } from '../utils/chartSampling';
import { useTheme } from '../utils/theme';

const formatYLabel = (val, currency) => {
    if (!val) return '';
    const n = Number(val);
    if (isNaN(n)) return '';
    // Format compact for space saving
    return n.toLocaleString(undefined, { maximumFractionDigits: 0, style: 'currency', currency: currency || 'USD' });
};

export default function CryptoGraph({
    type = 'line',
    data,
    width,
    height = 220,
    color = '#22c55e', // Green default
    currency = 'EUR'
}) {
    const { colors, isDark } = useTheme();
    
    if (!data || data.length === 0) return null;

    const screenWidth = width || Dimensions.get('window').width;
    const chartWidth = screenWidth - 50; // Reserve space for labels
    const maxLinePoints = Math.max(40, Math.floor(chartWidth / 4));
    const maxCandlePoints = Math.max(40, Math.floor(chartWidth / 5));

    // Horizontal Grid Lines Component
    const GridLines = () => (
        <View style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, justifyContent: 'space-between', paddingVertical: 10 }}>
            {[0, 1].map((i) => (
                <View
                    key={i}
                    style={{
                        borderBottomWidth: 1,
                        borderColor: isDark ? 'rgba(255,255,255,0.28)' : 'rgba(15,23,42,0.30)',
                        borderStyle: 'dotted',
                        opacity: 1,
                        width: '100%'
                    }}
                />
            ))}
        </View>
    );

    // Line Chart (Portfolio) - No interactive elements
    if (type === 'line') {
        const sampledData = downsampleLineData(data, maxLinePoints);
        const values = data.map(d => d.value);
        const max = Math.max(...values);
        const min = Math.min(...values);

        return (
            <View style={{ flexDirection: 'row', height }} pointerEvents="none">
                <View style={{ width: chartWidth, position: 'relative' }}>
                    <GridLines />
                    <LineChart.Provider data={sampledData}>
                        <LineChart width={chartWidth} height={height}>
                            <LineChart.Path color={color} width={2.5} />
                        </LineChart>
                    </LineChart.Provider>
                </View>

                {/* Y-Axis Labels overlay in reserved space */}
                <View style={{ width: 50, justifyContent: 'space-between', paddingVertical: 10, alignItems: 'flex-end', paddingRight: 8 }}>
                    <Text testID="graph-y-max" style={{ color: colors.textSecondary, fontSize: 10 }}>{formatYLabel(max, currency)}</Text>
                    <Text testID="graph-y-min" style={{ color: colors.textSecondary, fontSize: 10 }}>{formatYLabel(min, currency)}</Text>
                </View>
            </View>
        );
    }

    // Candlestick Chart (Coin Details) - No interactive elements
    if (type === 'candle') {
        const sampledData = downsampleCandleData(data, maxCandlePoints);
        const highs = data.map(d => d.high);
        const lows = data.map(d => d.low);
        const max = Math.max(...highs);
        const min = Math.min(...lows);

        return (
            <View pointerEvents="none">
                <View style={{ flexDirection: 'row', height }}>
                    <View style={{ width: chartWidth, position: 'relative' }}>
                        <GridLines />
                        <CandlestickChart.Provider data={sampledData}>
                            <CandlestickChart width={chartWidth} height={height}>
                                <CandlestickChart.Candles />
                            </CandlestickChart>
                        </CandlestickChart.Provider>
                    </View>

                    {/* Y-Axis Labels overlay */}
                    <View style={{ width: 50, justifyContent: 'space-between', paddingVertical: 10, alignItems: 'flex-end', paddingRight: 8 }}>
                        <Text testID="graph-y-max" style={{ color: colors.textSecondary, fontSize: 10 }}>{formatYLabel(max, currency)}</Text>
                        <Text testID="graph-y-min" style={{ color: colors.textSecondary, fontSize: 10 }}>{formatYLabel(min, currency)}</Text>
                    </View>
                </View>
            </View>
        );
    }

    return null;
}
